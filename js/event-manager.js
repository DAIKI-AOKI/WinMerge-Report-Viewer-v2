/**
 * EventManager - イベント管理モジュール（メモリリーク完全対策版）
 * ドラッグ&ドロップ、その他のイベントハンドラ
 * 依存: config.js, state.js, file-handler.js, navigation.js
 * 
 * @fileoverview イベントリスナーの管理とドラッグ&ドロップ処理
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { FileHandler } from './file-handler.js';
import { Navigation } from './navigation.js';

const EventManager = (() => {
    /** @type {string[]} ドラッグ&ドロップイベント名の配列 */
    const DRAG_EVENTS = ['dragenter', 'dragover', 'dragleave', 'drop'];
    /** @type {string[]} ハイライトイベント名の配列 */
    const HIGHLIGHT_EVENTS = ['dragenter', 'dragover'];
    /** @type {string[]} ハイライト解除イベント名の配列 */
    const UNHIGHLIGHT_EVENTS = ['dragleave', 'drop'];

    // ★メモリリーク対策: イベントハンドラの参照を保持
    /** @type {Object.<string, Function>} イベントハンドラの参照マップ */
    const eventHandlers = {
        fileInputChange: null,
        resetButtonClick: null,
        scrollTopButtonClick: null,
        dropAreaClick: null,
        dragPreventDefaults: null,
        dragHighlight: null,
        dragUnhighlight: null,
        drop: null
    };

    /**
     * 差分ブロックの総数を返す
     * @returns {number} 差分ブロックの総数
     */
    function getTotalDiffCount() {
        return AppState.diffBlocks?.length ?? 0;
    }

    /**
     * ドラッグ&ドロップのデフォルト動作を防止
     * @param {Event} e - イベントオブジェクト
     * @returns {void}
     */
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * ドロップエリアをハイライト
     * @returns {void}
     */
    function highlight() {
        if (!AppState.isProcessing) {
            AppState.elements.dropArea.classList.add('drag-over');
        }
    }

    /**
     * ドロップエリアのハイライトを解除
     * @returns {void}
     */
    function unhighlight() {
        AppState.elements.dropArea.classList.remove('drag-over');
    }

    /**
     * ファイルドロップ処理
     * @param {DragEvent} e - ドラッグイベント
     * @returns {void}
     */
    function handleDrop(e) {
        if (AppState.isProcessing) return;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            FileHandler.process(files[0]);
        }
    }

    /**
     * 初期イベントリスナーを登録（メモリリーク対策版）
     * @returns {void}
     */
    function initializeEventListeners() {
        const elements = AppState.elements;
        
        // ★修正: 既存のリスナーを先に削除（二重登録を防止）
        cleanup();
        
        // ★メモリリーク対策: ハンドラを変数に保存（クリーンアップ時に使用）
        
        // ファイル選択
        eventHandlers.fileInputChange = (e) => {
            const file = e.target.files[0];
            if (file) FileHandler.process(file);
        };
        elements.fileInput.addEventListener('change', eventHandlers.fileInputChange);
        
        // リセットボタン
        eventHandlers.resetButtonClick = () => Navigation.resetInterface();
        elements.resetButton.addEventListener('click', eventHandlers.resetButtonClick);
        
        // トップへスクロールボタン
        eventHandlers.scrollTopButtonClick = () => {
            AppState.isScrollingToTop = true;
            Navigation.clearCurrentDiffHighlight();
            Navigation.clearMarkerSelection();
            AppState.currentDiffIndex = -1;

            const total = getTotalDiffCount();
            if (total > 0) {
                elements.diffInfo.textContent = `差分: 0 / ${total}`;
            }

            elements.diffContent.scrollTo({ top: 0, behavior: 'smooth' });

            setTimeout(() => {
                AppState.currentDiffIndex = -1;
                AppState.isScrollingToTop = false;
            }, CONFIG.SCROLL_TO_TOP_RESET_DELAY_MS);
        };
        elements.scrollTopButton.addEventListener('click', eventHandlers.scrollTopButtonClick);
        
        // ドロップエリアクリック
        eventHandlers.dropAreaClick = () => {
            if (!AppState.isProcessing) {
                elements.fileInput.click();
            }
        };
        elements.dropArea.addEventListener('click', eventHandlers.dropAreaClick);
        
        // ドラッグ&ドロップイベント
        eventHandlers.dragPreventDefaults = preventDefaults;
        DRAG_EVENTS.forEach(eventName => {
            elements.dropArea.addEventListener(eventName, eventHandlers.dragPreventDefaults, false);
            document.body.addEventListener(eventName, eventHandlers.dragPreventDefaults, false);
        });
        
        eventHandlers.dragHighlight = highlight;
        HIGHLIGHT_EVENTS.forEach(eventName => {
            elements.dropArea.addEventListener(eventName, eventHandlers.dragHighlight, false);
        });
        
        eventHandlers.dragUnhighlight = unhighlight;
        UNHIGHLIGHT_EVENTS.forEach(eventName => {
            elements.dropArea.addEventListener(eventName, eventHandlers.dragUnhighlight, false);
        });
        
        eventHandlers.drop = handleDrop;
        elements.dropArea.addEventListener('drop', eventHandlers.drop, false);
        
        Logger.log('✅ Event listeners initialized with cleanup support');
    }

    /**
     * すべてのイベントリスナーをクリーンアップ（メモリリーク対策の要）
     * @returns {void}
     */
    function cleanup() {
        const elements = AppState.elements;
        
        if (!elements) {
            Logger.warn('Elements not found during EventManager cleanup');
            return;
        }
        
        Logger.log('=== EventManager クリーンアップ開始 ===');
        
        // ファイル選択
        if (eventHandlers.fileInputChange && elements.fileInput) {
            elements.fileInput.removeEventListener('change', eventHandlers.fileInputChange);
            eventHandlers.fileInputChange = null;
            Logger.log('✅ fileInput changeハンドラを削除');
        }
        
        // リセットボタン
        if (eventHandlers.resetButtonClick && elements.resetButton) {
            elements.resetButton.removeEventListener('click', eventHandlers.resetButtonClick);
            eventHandlers.resetButtonClick = null;
            Logger.log('✅ resetButton clickハンドラを削除');
        }
        
        // トップへスクロールボタン
        if (eventHandlers.scrollTopButtonClick && elements.scrollTopButton) {
            elements.scrollTopButton.removeEventListener('click', eventHandlers.scrollTopButtonClick);
            eventHandlers.scrollTopButtonClick = null;
            Logger.log('✅ scrollTopButton clickハンドラを削除');
        }
        
        // ドロップエリアクリック
        if (eventHandlers.dropAreaClick && elements.dropArea) {
            elements.dropArea.removeEventListener('click', eventHandlers.dropAreaClick);
            eventHandlers.dropAreaClick = null;
            Logger.log('✅ dropArea clickハンドラを削除');
        }
        
        // ドラッグ&ドロップイベント
        if (eventHandlers.dragPreventDefaults && elements.dropArea) {
            DRAG_EVENTS.forEach(eventName => {
                elements.dropArea.removeEventListener(eventName, eventHandlers.dragPreventDefaults, false);
                document.body.removeEventListener(eventName, eventHandlers.dragPreventDefaults, false);
            });
            eventHandlers.dragPreventDefaults = null;
            Logger.log('✅ drag preventDefaults ハンドラを削除');
        }
        
        if (eventHandlers.dragHighlight && elements.dropArea) {
            HIGHLIGHT_EVENTS.forEach(eventName => {
                elements.dropArea.removeEventListener(eventName, eventHandlers.dragHighlight, false);
            });
            eventHandlers.dragHighlight = null;
            Logger.log('✅ drag highlight ハンドラを削除');
        }
        
        if (eventHandlers.dragUnhighlight && elements.dropArea) {
            UNHIGHLIGHT_EVENTS.forEach(eventName => {
                elements.dropArea.removeEventListener(eventName, eventHandlers.dragUnhighlight, false);
            });
            eventHandlers.dragUnhighlight = null;
            Logger.log('✅ drag unhighlight ハンドラを削除');
        }
        
        if (eventHandlers.drop && elements.dropArea) {
            elements.dropArea.removeEventListener('drop', eventHandlers.drop, false);
            eventHandlers.drop = null;
            Logger.log('✅ drop ハンドラを削除');
        }
        
        Logger.log('=== EventManager クリーンアップ完了 ===');
    }

    // 公開API
    return {
        initializeEventListeners,
        cleanup,
        preventDefaults,
        highlight,
        unhighlight,
        handleDrop
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.EventManager としてアクセス可能

export { EventManager };