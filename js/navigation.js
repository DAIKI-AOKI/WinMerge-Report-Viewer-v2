/**
 * Navigation - ナビゲーション制御モジュール（メモリリーク完全対策版）
 * 依存: config.js, state.js, utils.js, ui.js, html-processor.js, diff-detector.js
 * 
 * @fileoverview ナビゲーション機能とクリーンアップ処理
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { CSSManager } from './utils.js';
import { UI } from './ui.js';
import { HTMLProcessor } from './html-processor.js';
import { BlockMarkerGenerator } from './diff-detector.js';

const Navigation = (() => {
    /**
     * 選択されたマーカーをハイライト
     * @param {number} index - ブロックインデックス
     * @returns {void}
     */
    function highlightSelectedMarker(index) {
        clearMarkerSelection();
        
        const markers = document.querySelectorAll(`.block-marker[data-block-index="${index}"]`);
        markers.forEach(m => m.classList.add('marker-selected'));
        
        if (markers.length > 0) {
            Logger.log('マーカー選択:', index, `(${markers.length}件)`);
        }
    }

    /**
     * マーカーの選択状態をクリア
     * @returns {void}
     */
    function clearMarkerSelection() {
        document.querySelectorAll('.marker-selected').forEach(marker => {
            marker.classList.remove('marker-selected');
        });
    }

    /**
     * 現在の差分ハイライトをクリア
     * @returns {void}
     */
    function clearCurrentDiffHighlight() {
        document.querySelectorAll('.current-diff').forEach(el => {
            el.classList.remove('current-diff');
        });
        
        document.querySelectorAll('.block-highlight-wrapper').forEach(el => {
            el.remove();
        });
        
        // handleMarkerClick() が付与したインラインスタイルも合わせてクリアする。
        // CSS クラスの削除だけではインラインスタイルは残留するため、ここで明示的に除去する。
        document.querySelectorAll('tr[style*="box-shadow"]').forEach(tr => {
            tr.style.boxShadow = '';
            tr.style.borderRadius = '';
        });
        
        clearMarkerSelection();
    }

    /**
     * すべてのマーカーをクリーンアップ（メモリリーク完全対策版）
     * @private
     * @returns {void}
     */
    function cleanupAllMarkers() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        Logger.log('=== すべてのマーカーをクリーンアップ開始 ===');

        // イベント委譲リスナーを先に削除（ペイン要素ごと削除する前に必ず実行）
        BlockMarkerGenerator.cleanupDelegation();
        Logger.log('✅ BlockMarkerGenerator のイベントリスナーを削除');

        // イベント委譲モデルのため、マーカー要素への個別リスナー登録は行っていない。
        // DOM から remove() するだけでよい。
        [paneLeft, paneRight].forEach(pane => {
            if (!pane) return;
            const allMarkers = pane.querySelectorAll('.marker');
            Logger.log(`クリーンアップ対象のマーカー数: ${allMarkers.length} (${pane.id})`);
            allMarkers.forEach(marker => {
                try {
                    marker.remove();
                } catch (e) {
                    Logger.warn('マーカー削除失敗:', e);
                }
            });
        });

        Logger.log('=== すべてのマーカーのクリーンアップ完了 ===');
    }

    /**
     * インターフェースをリセット（メモリリーク対策強化版）
     * @returns {void}
     */
    function resetInterface() {
        Logger.log('=== インターフェースをリセット開始 ===');
        try {
            // ステップ1: イベントハンドラとタイマーのクリーンアップ
            AppState.cleanupTimers();
            AppState.cleanupEventHandlers();
            
            // ステップ2: 状態リセット
            AppState.reset();
            
            // ステップ3: スタイルの削除
            HTMLProcessor.removeImportedStyle();
            
            // ステップ4: すべてのマーカーを統合的にクリーンアップ
            cleanupAllMarkers();
            
            // ステップ5: ビューアをクリア
            UI.clearViewer();
            
            // ステップ6: ドロップエリアを表示
            if (AppState.elements.dropArea) {
                AppState.elements.dropArea.style.display = 'block';
            }
            
            // ステップ7: コントロールボタンを非表示
            CONFIG.CONTROL_BUTTONS.forEach(id => {
                if (AppState.elements[id]) {
                    CSSManager.hideElement(AppState.elements[id], 'button-visible', 'button-hidden');
                }
            });
            
            // ステップ8: 差分情報を非表示
            if (AppState.elements.diffInfo) {
                CSSManager.hideElement(AppState.elements.diffInfo, 'info-visible', 'info-hidden');
            }
            
            // ステップ9: 固定ヘッダーを非表示
            if (AppState.elements.fixedHeader) {
                CSSManager.hideElement(AppState.elements.fixedHeader, 'fixed-header-visible', 'fixed-header-hidden');
            }
            
            // ステップ10: ファイル入力をリセット
            if (AppState.elements.fileInput) {
                AppState.elements.fileInput.value = '';
            }
            
            // ステップ11: スクロール位置をリセット
            if (AppState.elements.diffContent) {
                AppState.elements.diffContent.scrollTop = 0;
            }
            
            // ステップ12: ハイライトをクリア
            clearCurrentDiffHighlight();
            
            // ステップ13: ブロックハイライトラッパーを削除
            document.querySelectorAll('.block-highlight-wrapper').forEach(el => {
                el.remove();
            });
            
            // ステップ14: ツールヘッダーを表示
            if (AppState.elements.toolHeader) {
                CSSManager.showElement(AppState.elements.toolHeader, 'toolHeader-visible', 'toolHeader-hidden');
            }
            
            Logger.log('✅ インターフェースリセット完了');
        } catch (error) {
            Logger.error('Reset interface error:', error);
            UI.showMessage('リセット中にエラーが発生しましたが、継続できます。', 'warning');
        }
    }

    // 公開API
    return {
        highlightSelectedMarker,
        clearMarkerSelection,
        clearCurrentDiffHighlight,
        resetInterface,
        cleanupAllMarkers
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.Navigation としてアクセス可能

export { Navigation };