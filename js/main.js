/**
 * Main - アプリケーション初期化・統合モジュール (改善版 v6.2)
 * すべてのモジュールを統合し、アプリケーションを起動
 * 依存: すべてのモジュール
 * 
 * @fileoverview アプリケーションのエントリーポイントと初期化処理
 */

'use strict';

import { ProgressIndicator } from './progress-indicator.js';
import { CONFIG } from './config.js';
import { FileValidationError, FileProcessingError, HTMLParsingError, TableProcessingError, NavigationError } from './errors.js';
import { AppState, Logger } from './state.js';
import { Utils, CSSManager } from './utils.js';
import { ErrorHandler } from './error-handler.js';
import { UI } from './ui.js';
import { HTMLProcessor } from './html-processor.js';
import { TableProcessor } from './table-processor.js';
import { DiffBlockDetector, BlockMarkerGenerator } from './diff-detector.js';
import { Navigation } from './navigation.js';
import { FileHandler } from './file-handler.js';
import { EventManager } from './event-manager.js';

/**
 * @typedef {Object} MemoryInfo
 * @property {number} used - 使用中のヒープサイズ（MB）
 * @property {number} total - 総ヒープサイズ（MB）
 * @property {number} limit - ヒープサイズの上限（MB）
 */

/**
 * @typedef {Object} DebugBlockResult
 * @property {DiffBlock[]} blocks - 検出されたブロック配列
 * @property {BlockStats} stats - ブロック統計情報
 */

const WinMergeViewer = (() => {
    
    /**
     * パフォーマンスモニタリング
     * @returns {void}
     */
    function monitorPerformance() {
        if (AppState.timers.memoryMonitor) {
            clearInterval(AppState.timers.memoryMonitor);
            AppState.timers.memoryMonitor = null;
        }
        if ('performance' in window && 'memory' in window.performance) {
            const checkMemory = () => {
                try {
                    const memory = window.performance.memory;
                    if (memory.usedJSHeapSize && memory.jsHeapSizeLimit) {
                        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
                        if (usageRatio > CONFIG.MEMORY_THRESHOLD_RATIO) {
                            Logger.warn('Memory usage is high');
                        }
                    }
                } catch (error) {
                    Logger.warn('Memory check failed:', error);
                }
            };
            AppState.timers.memoryMonitor = setInterval(checkMemory, CONFIG.MEMORY_CHECK_INTERVAL);
        }
    }

    /**
     * エラーバウンダリをセットアップ
     * @returns {void}
     */
    function setupErrorBoundary() {
        window.addEventListener('error', (event) => {
            event.preventDefault();
            const error = event.error || new Error(event.message);
            ErrorHandler.handle(error, 'Global error');
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            event.preventDefault();
            const error = event.reason instanceof Error 
                ? event.reason 
                : new Error(String(event.reason));
            ErrorHandler.handle(error, 'Unhandled promise rejection');
        });
    }

    /**
     * アクセシビリティを強化
     * @returns {void}
     */
    function enhanceAccessibility() {
        AppState.elements.resetButton.setAttribute('aria-label', 'インターフェースをリセット');
        AppState.elements.scrollTopButton.setAttribute('aria-label', 'ページトップへスクロール');
        AppState.elements.prevDiffButton.setAttribute('aria-label', '前の差分へジャンプ');
        AppState.elements.nextDiffButton.setAttribute('aria-label', '次の差分へジャンプ');
    }

    /**
     * アプリケーション初期化
     * @returns {void}
     */
    function initializeApp() {
        try {
            setupErrorBoundary();
            AppState.init();
            BlockMarkerGenerator.setNavigation(Navigation);
            EventManager.initializeEventListeners();
            enhanceAccessibility();
            monitorPerformance();
            
            Logger.log('WinMerge Diff Report Viewer v6.2 initialized');
        } catch (error) {
            Logger.error('アプリケーション初期化エラー:', error);
            UI.showMessage('アプリケーションの初期化に失敗しました。ページをリロードしてください。');
        }
    }

    /**
     * ページライフサイクルイベント
     * @returns {void}
     */
    function setupLifecycleEvents() {
        // ページアンロード時のクリーンアップ
        window.addEventListener('beforeunload', () => {
            try {
                AppState.cleanupTimers();
                AppState.cleanupEventHandlers();
                
                // import 済みのモジュールは undefined にならないため typeof チェック不要
                BlockMarkerGenerator.cleanup();
                EventManager.cleanup();
                
                if (AppState.intersectionObserver) {
                    AppState.intersectionObserver.disconnect();
                    AppState.intersectionObserver = null;
                }
                
                AppState.reset();
                HTMLProcessor.removeImportedStyle();
                
                Logger.log('✅ Cleanup completed on page unload');
            } catch (error) {
                Logger.warn('Cleanup error during unload:', error);
            }
        });

        // ページ可視性変更時の処理
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (AppState.timers.memoryMonitor) {
                    clearInterval(AppState.timers.memoryMonitor);
                    AppState.timers.memoryMonitor = null;
                }
            } else {
                if (AppState.elements?.viewer?.querySelector('table')) {
                    monitorPerformance();
                }
            }
        });
    }



    /**
     * デバッグ関数群
     * @namespace DebugFunctions
     */
    const DebugFunctions = {
        /**
         * ブロック情報を表示
         * @returns {DebugBlockResult|void}
         */
        showBlocks() {
            const table = AppState.elements.viewer.querySelector('table');
            if (!table) {
                console.log('⚠️ テーブルが見つかりません');
                return;
            }
            
            const blocks = DiffBlockDetector.detectBlocks(table);
            const stats = DiffBlockDetector.getBlockStats(blocks);
            
            console.log('=== ブロック統計 ===');
            console.log('総ブロック数:', stats.total);
            console.log('変更系ブロック:', stats.addBlocks, `(${stats.totalAddLines}行)`, '--- changed / word');
            console.log('削除系ブロック:', stats.delBlocks, `(${stats.totalDelLines}行)`, '--- del / moved_from / moved_to');
            console.log('平均ブロックサイズ:', stats.averageBlockSize.toFixed(2), '行');
            console.log('');
            console.log('=== ブロック詳細 ===');
            // type は CONFIG.DIFF_COLOR_MAP の type 値（'changed'/'word'/'del'/'moved_from'/'moved_to'/'separator'）
            const TYPE_LABEL = {
                changed:    '変更行',
                word:       '行内差分',
                del:        '削除・追加行',
                moved_from: '移動元',
                moved_to:   '移動先',
                separator:  '区切り行',
                unknown:    '不明',
            };
            console.table(blocks.map(b => ({
                ID: b.id + 1,
                タイプ: TYPE_LABEL[b.type] ?? b.type,
                行数: b.rows.length,
                開始行: b.startIndex,
                終了行: b.endIndex
            })));
            
            return { blocks, stats };
        },

        /**
         * ブロックを視覚化
         * @returns {void}
         */
        visualizeBlocks() {
            const table = AppState.elements.viewer.querySelector('table');
            if (!table) {
                console.log('⚠️ テーブルが見つかりません');
                return;
            }
            
            const blocks = DiffBlockDetector.detectBlocks(table);
            
            table.querySelectorAll('tr').forEach(row => {
                row.style.border = '';
                row.style.position = '';
            });
            
            // DiffBlock.type を色にマッピング（CONFIG.DIFF_COLOR_MAP の6色に対応）
            const TYPE_COLORS = {
                changed:    '#FFC107', // 変更行: アンバー
                word:       '#FF9800', // 変更行内差分: オレンジ
                del:        '#f44336', // 削除・追加行: 赤
                moved_from: '#9C27B0', // 移動元: 紫
                moved_to:   '#673AB7', // 移動先: 濃紫
                separator:  '#9E9E9E', // 区切り行: グレー
            };
            const DEFAULT_COLOR = '#607D8B'; // unknown: ブルーグレー

            blocks.forEach((block, index) => {
                const color = TYPE_COLORS[block.type] || DEFAULT_COLOR;
                const firstRow = block.rows[0];
                const lastRow = block.rows[block.rows.length - 1];
                
                firstRow.style.position = 'relative';
                firstRow.style.borderTop = `3px solid ${color}`;
                lastRow.style.borderBottom = `3px solid ${color}`;
                
                block.rows.forEach(row => {
                    row.style.borderLeft  = `3px solid ${color}`;
                    row.style.borderRight = `3px solid ${color}`;
                });
                
                firstRow.title = `ブロック ${index + 1}: ${block.type} (${block.rows.length}行)`;
            });
            
            console.log('✅ ブロックの視覚化が完了しました');
            console.log('💡 元に戻すには: location.reload()');
        },

        /**
         * ブロックモード状態を表示
         * @returns {void}
         */
        blockMode() {
            console.log('=== Block Mode Status ===');
            console.log('diffBlocks length:', AppState.diffBlocks?.length || 0);
            console.log('currentDiffIndex:', AppState.currentDiffIndex);
        },

        /**
         * メモリ状態を表示
         * @returns {MemoryInfo|void}
         */
        memoryStatus() {
            if (!performance.memory) {
                console.log('⚠️ このブラウザはperformance.memoryをサポートしていません');
                return;
            }
            const used = performance.memory.usedJSHeapSize / 1024 / 1024;
            const total = performance.memory.totalJSHeapSize / 1024 / 1024;
            const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
            console.log('=== Memory Status ===');
            console.log('Used:', used.toFixed(2), 'MB');
            console.log('Total:', total.toFixed(2), 'MB');
            console.log('Limit:', limit.toFixed(2), 'MB');
            console.log('Usage:', (used / limit * 100).toFixed(2), '%');
            return { used, total, limit };
        },

        /**
         * AppState状態を表示
         * @returns {void}
         */
        appState() {
            console.log('=== AppState Status ===');
            console.log('isProcessing:', AppState.isProcessing);
            console.log('diffBlocks count:', AppState.diffBlocks?.length || 0);
            console.log('currentDiffIndex:', AppState.currentDiffIndex);
        },

        /**
         * すべてのデバッグ情報を表示
         * @returns {void}
         */
        all() {
            this.memoryStatus();
            console.log('');
            this.appState();
            console.log('');
            this.blockMode();
        }
    };

    // 公開API - すべてのモジュールを統合
    return {
        // バージョン情報
        version: '6.2.0',
        
        // 初期化
        init: () => {
            initializeApp();
            setupLifecycleEvents();
        },
        
        // コアモジュール
        AppState,
        Logger,
        CONFIG,
        
        // ユーティリティ
        Utils,
        CSSManager,
        
        // UI制御
        UI,
        
        // エラーハンドリング
        ErrorHandler,
        FileValidationError,
        FileProcessingError,
        HTMLParsingError,
        TableProcessingError,
        NavigationError,
        
        // ファイル処理
        FileHandler,
        HTMLProcessor,
        TableProcessor,
        
        // ナビゲーション
        Navigation,
        
        // マーカー管理
        DiffBlockDetector,
        BlockMarkerGenerator,
        
        // イベント管理
        EventManager,
        
        // プログレス表示
        ProgressIndicator,
        
        // デバッグ
        debug: DebugFunctions
    };
    
})();

// ========================================
// アプリケーション起動
// ========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WinMergeViewer.init());
} else {
    WinMergeViewer.init();
}

// ========================================
// グローバルオブジェクト公開（デバッグモード時のみ）
// 本番環境では内部モジュールをコンソールから操作できないよう制限する
// ========================================
if (WinMergeViewer.Logger.enabled) {
    window.WinMergeViewer = WinMergeViewer;
}

// ========================================
// デバッグ関数のグローバル公開（デバッグモード時のみ）
// ========================================
if (WinMergeViewer.debug && WinMergeViewer.Logger.enabled) {
    console.log('');
    console.log('=== デバッグ関数が有効です ===');
    console.log('使用可能な関数:');
    console.log('  - WinMergeViewer.debug.showBlocks()');
    console.log('  - WinMergeViewer.debug.visualizeBlocks()');
    console.log('  - WinMergeViewer.debug.blockMode()');
    console.log('  - WinMergeViewer.debug.memoryStatus()');
    console.log('  - WinMergeViewer.debug.appState()');
    console.log('  - WinMergeViewer.debug.all()');
    console.log('');
    console.log('💡 短縮形も利用可能:');
    
    // 短縮形のエイリアス（デバッグモード時のみ）
    window.wmv = WinMergeViewer;
    window.debug = WinMergeViewer.debug;
    
    console.log('  - wmv.debug.showBlocks() または debug.showBlocks()');
    console.log('  - wmv.debug.all() または debug.all()');
    console.log('');
}

// 起動ログはデバッグモード時のみ出力
if (WinMergeViewer.Logger.enabled) {
    console.log('');
    console.log('=== WinMerge Report Viewer v6.2 ===');
    console.log('📦 WinMergeViewer オブジェクトからすべてのモジュールにアクセス可能');
    console.log('🐛 デバッグ: wmv.debug.all() で状態確認');
    console.log('');
}
