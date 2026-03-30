/**
 * WinMerge Report Viewer - 状態管理
 * 
 * アプリケーション状態の管理とログ出力
 * 依存: なし
 * 
 * @fileoverview アプリケーション全体の状態管理とロギング機能
 */

'use strict';

/**
 * @typedef {Object} EventHandlers
 * @property {Function|null} keydown - キーボードイベントハンドラ
 * @property {Function|null} debouncedResize - リサイズデバウンスハンドラ
 * @property {number|null} scrollAnimationFrame - スクロールアニメーションフレームID
 * @property {number|null} resizeTimeout - リサイズタイムアウトID
 * @property {Function|null} markerResizeCallback - リサイズ時のミニマップマーカー再配置コールバック
 */

/**
 * @typedef {Object} DOMElements
 * @property {HTMLInputElement} fileInput - ファイル入力要素
 * @property {HTMLElement} viewer - ビューワー要素
 * @property {HTMLElement} diffContent - 差分コンテンツ要素
 * @property {HTMLElement} locationPane - ロケーションペイン要素
 * @property {HTMLElement} dropArea - ドロップエリア要素
 * @property {HTMLButtonElement} resetButton - リセットボタン
 * @property {HTMLButtonElement} scrollTopButton - トップへスクロールボタン
 * @property {HTMLButtonElement} prevDiffButton - 前の差分ボタン
 * @property {HTMLButtonElement} nextDiffButton - 次の差分ボタン
 * @property {HTMLElement} diffInfo - 差分情報表示要素
 * @property {HTMLElement} fixedHeader - 固定ヘッダー要素
 * @property {HTMLTableRowElement} fixedHeaderRow - 固定ヘッダー行要素
 * @property {HTMLElement} toolHeader - ツールヘッダー要素
 */

/**
 * @typedef {Object} DiffBlock
 * @property {number} id - ブロックID
 * @property {'changed'|'word'|'del'|'moved_from'|'moved_to'|'separator'|'unknown'} type - 差分タイプ（CONFIG.DIFF_COLOR_MAP の type 値に対応）
 * @property {string} color - 背景色（後方互換用・代表色）
 * @property {string|null} leftColor - 旧ファイル側の背景色（ミニマップ左ペイン用）
 * @property {string|null} rightColor - 新ファイル側の背景色（ミニマップ右ペイン用）
 * @property {number} startIndex - 開始行インデックス
 * @property {number} endIndex - 終了行インデックス
 * @property {HTMLTableRowElement[]} rows - 行要素の配列
 */

/**
 * @typedef {Object} Timers
 * @property {number|null} memoryMonitor - メモリ監視タイマーID
 */

/**
 * アプリケーション状態管理オブジェクト
 * @namespace AppState
 */
const AppState = {
    /** @type {EventHandlers} イベントハンドラの管理 */
    eventHandlers: {
        keydown: null,
        debouncedResize: null,
        scrollAnimationFrame: null,
        resizeTimeout: null,
        /** @type {Function|null} リサイズ時のミニマップマーカー再配置コールバック */
        markerResizeCallback: null,
    },
    
    /** @type {DOMElements|null} DOM要素への参照 */
    elements: null,
    
    /** @type {HTMLStyleElement|null} インポートされたスタイル要素 */
    importedStyleElem: null,
    
    /** @type {boolean} ファイル処理中フラグ */
    isProcessing: false,
    
    /** @type {DiffBlock[]} 差分ブロック情報の配列 */
    diffBlocks: [],
    
    /** @type {number} 現在の差分インデックス */
    currentDiffIndex: -1,
    
    /** @type {boolean} 差分へのナビゲーション中フラグ */
    isNavigatingToDiff: false,
    
    /** @type {boolean} トップへスクロール中フラグ */
    isScrollingToTop: false,
    
    /** @type {IntersectionObserver|null} Intersection Observer インスタンス */
    intersectionObserver: null,
    
    /** @type {Timers} タイマー管理 */
    timers: {
        memoryMonitor: null
    },

    /**
     * アプリケーション状態を初期化
     * @returns {void}
     */
    init() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            viewer: document.getElementById('viewer'),
            diffContent: document.getElementById('diffContent'),
            locationPane: document.getElementById('locationPane'),
            locationPaneLeft: document.getElementById('locationPaneLeft'),
            locationPaneRight: document.getElementById('locationPaneRight'),
            dropArea: document.getElementById('dropArea'),
            resetButton: document.getElementById('resetButton'),
            scrollTopButton: document.getElementById('scrollTopButton'),
            prevDiffButton: document.getElementById('prevDiffButton'),
            nextDiffButton: document.getElementById('nextDiffButton'),
            diffInfo: document.getElementById('diffInfo'),
            fixedHeader: document.getElementById('fixedHeader'),
            fixedHeaderRow: document.getElementById('fixedHeaderRow'),
            toolHeader: document.getElementById('toolHeader')
        };
    },

    /**
     * タイマーをクリーンアップ
     * file-handler.js / navigation.js / main.js で重複定義されていたため
     * AppState に集約した。各モジュールはこのメソッドを呼び出すこと。
     * @returns {void}
     */
    cleanupTimers() {
        Object.keys(this.timers).forEach(key => {
            if (this.timers[key]) {
                clearInterval(this.timers[key]);
                this.timers[key] = null;
            }
        });
        Logger.log('✅ すべてのタイマーをクリーンアップ');
    },

    /**
     * アプリケーション状態をリセット
     * @returns {void}
     */
    reset() {
        this.isProcessing = false;
        this.currentDiffIndex = -1;
        this.isNavigatingToDiff = false;
        // 差分ブロックのクリーンアップ（rows内の<tr>参照を解放してGCを促す）
        if (Array.isArray(this.diffBlocks)) {
            this.diffBlocks.forEach(block => {
                if (block && typeof block === 'object') {
                    if (Array.isArray(block.rows)) {
                        block.rows.length = 0;
                    }
                    Object.keys(block).forEach(key => { block[key] = null; });
                }
            });
            this.diffBlocks.length = 0;
        }
        this.diffBlocks = [];

        // IntersectionObserverのクリーンアップ
        if (this.intersectionObserver) {
            try {
                this.intersectionObserver.disconnect();
                this.intersectionObserver = null;
            } catch (e) {
                Logger.warn('IntersectionObserver cleanup failed:', e);
            }
        }

        Logger.log('AppState reset completed');
    },

    /**
     * イベントハンドラをクリーンアップ
     * @returns {void}
     */
    cleanupEventHandlers() {
        try {
            // アニメーションフレームのキャンセル
            if (this.eventHandlers.scrollAnimationFrame) {
                cancelAnimationFrame(this.eventHandlers.scrollAnimationFrame);
                this.eventHandlers.scrollAnimationFrame = null;
            }

            // リサイズイベントハンドラの削除
            if (this.eventHandlers.debouncedResize) {
                window.removeEventListener('resize', this.eventHandlers.debouncedResize);
                this.eventHandlers.debouncedResize = null;
            }

            // リサイズタイムアウトのクリア
            if (this.eventHandlers.resizeTimeout) {
                clearTimeout(this.eventHandlers.resizeTimeout);
                this.eventHandlers.resizeTimeout = null;
            }

            // キーボードイベントハンドラの削除
            if (this.eventHandlers.keydown) {
                document.removeEventListener('keydown', this.eventHandlers.keydown);
                this.eventHandlers.keydown = null;
            }

            // ミニマップマーカー再配置コールバックのクリア
            if (this.eventHandlers.markerResizeCallback) {
                this.eventHandlers.markerResizeCallback = null;
            }

            // IntersectionObserverの切断
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
                this.intersectionObserver = null;
            }

            Logger.log('All event handlers cleaned up');
        } catch (error) {
            Logger.error('Cleanup event handlers error:', error);
        }
    }
};

/**
 * ログ出力管理オブジェクト
 * @namespace Logger
 */
const Logger = {
    /**
     * デバッグモードが有効かどうかを判定
     * ★修正3: localStorage による判定を除去。
     *   理由: 社内PCで過去に localStorage.debug = 'true' がセットされた
     *   ブラウザでは意図せずデバッグモードが有効になり、
     *   通常非表示の「ブロック表示」切替ボタン等が露出してしまう。
     *   判定は localhost / 127.0.0.1 か URLパラメータ debug=true のみとする。
     *   手動でデバッグを有効にしたい場合は URL に ?debug=true を付与すること。
     * @returns {boolean} デバッグモードが有効な場合true
     */
    get enabled() {
        return window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.search.includes('debug=true');
    },
    
    /**
     * デバッグログを出力（デバッグモード時のみ）
     * @param {...*} args - 出力する引数
     * @returns {void}
     */
    log(...args) {
        if (this.enabled) console.log(...args);
    },
    
    /**
     * 警告ログを出力
     * @param {...*} args - 出力する引数
     * @returns {void}
     */
    warn(...args) {
        console.warn(...args);
    },
    
    /**
     * エラーログを出力
     * @param {...*} args - 出力する引数
     * @returns {void}
     */
    error(...args) {
        console.error(...args);
    }
};

export { AppState, Logger };