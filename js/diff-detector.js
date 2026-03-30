/**
 * DiffBlockDetector & BlockMarkerGenerator (改善版 v6.1)
 * 差分ブロック検出とマーカー生成（青枠リサイズ対応版）
 * 依存: config.js, state.js, utils.js, table-processor.js
 * 
 * @fileoverview 差分ブロックの検出とマーカー生成を行うモジュール
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { CSSManager } from './utils.js';
import { TableProcessor } from './table-processor.js';

/**
 * @typedef {Object} BlockStats
 * @property {number} total - 総ブロック数
 * @property {number} addBlocks - 追加ブロック数
 * @property {number} delBlocks - 削除ブロック数
 * @property {number} totalAddLines - 追加行の総数
 * @property {number} totalDelLines - 削除行の総数
 * @property {number} averageBlockSize - 平均ブロックサイズ
 */

// ========================================
// DiffBlockDetector - 差分ブロック検出
// ========================================
const DiffBlockDetector = (() => {
    /**
     * テーブルから差分ブロックを検出
     * @param {HTMLTableElement} table - 対象テーブル
     * @returns {DiffBlock[]} ブロック配列
     */
    function detectBlocks(table) {
        Logger.log('=== ブロック検出開始 ===');
        
        const rows = table.querySelectorAll('tr');
        const blocks = [];
        let currentBlock = null;
        
        rows.forEach((row, index) => {
            // 左列(旧ファイル)・右列(新ファイル)の色を個別に取得
            const { left: leftColor, right: rightColor } = TableProcessor.getRowColors(row);
            const color = leftColor || rightColor; // どちらかに色があれば差分行

            if (color) {
                const type = _colorToType(color);
                
                // 同じタイプで連続している場合は結合
                if (currentBlock && 
                    currentBlock.type === type && 
                    currentBlock.endIndex === index - 1) {
                    currentBlock.endIndex = index;
                    currentBlock.rows.push(row);
                } else {
                    if (currentBlock) {
                        blocks.push(currentBlock);
                    }
                    currentBlock = {
                        id: blocks.length,
                        type: type,
                        color: color,       // 後方互換用（代表色）
                        leftColor,          // 旧ファイル側の色（ミニマップ左ペイン用）
                        rightColor,         // 新ファイル側の色（ミニマップ右ペイン用）
                        startIndex: index,
                        endIndex: index,
                        rows: [row],
                    };
                }
            } else {
                if (currentBlock) {
                    blocks.push(currentBlock);
                    currentBlock = null;
                }
            }
        });
        
        if (currentBlock) {
            blocks.push(currentBlock);
        }
        
        Logger.log(`検出されたブロック数: ${blocks.length}`);
        return blocks;
    }
    
    /**
     * 背景色から差分タイプを判定
     * CONFIG.DIFF_COLOR_MAP を参照することで、色設定の変更に自動追従する。
     * ハードコードを排除し Single Source of Truth を維持する。
     * @private
     * @param {string} color - 背景色（rgb形式）
     * @returns {string} 差分タイプ（CONFIG.DIFF_COLOR_MAP の type 値、または 'unknown'）
     */
    function _colorToType(color) {
        const entry = CONFIG.DIFF_COLOR_MAP.find(e => e.color === color);
        return entry ? entry.type : 'unknown';
    }
    
    /**
     * 差分タイプをカテゴリに分類するための定数（モジュールスコープ）
     * 呼び出しごとに Set を生成するコストを避けるため、ここで一度だけ定義する。
     *
     * WinMerge の変更系: changed / word（変更行）
     * WinMerge の削除系: del / moved_from / moved_to
     * その他           : separator / unknown
     */
    const _CLASSIFY_ADD_TYPES = new Set(['changed', 'word']);
    const _CLASSIFY_DEL_TYPES = new Set(['del', 'moved_from', 'moved_to']);

    /**
     * 差分タイプをカテゴリに分類する
     * CONFIG.DIFF_COLOR_MAP の type 値に合わせて「変更系」「削除系」「その他」に仕分ける。
     * _colorToType() が旧 'add' を返さなくなったため、CONFIG を参照して判定する。
     * @private
     * @param {string} type - DiffBlock.type 値
     * @returns {'add'|'del'|'other'} 統計カテゴリ（'add' = 変更系、'del' = 削除系）
     */
    function _classifyBlockType(type) {
        if (_CLASSIFY_ADD_TYPES.has(type)) return 'add';
        if (_CLASSIFY_DEL_TYPES.has(type)) return 'del';
        return 'other'; // separator / unknown
    }

    /**
     * ブロック統計を取得
     * @param {DiffBlock[]} blocks - ブロック配列
     * @returns {BlockStats} 統計情報
     */
    function getBlockStats(blocks) {
        const stats = {
            total: blocks.length,
            addBlocks: 0,
            delBlocks: 0,
            totalAddLines: 0,
            totalDelLines: 0,
            averageBlockSize: 0
        };
        
        blocks.forEach(block => {
            const category = _classifyBlockType(block.type);
            if (category === 'add') {
                stats.addBlocks++;
                stats.totalAddLines += block.rows.length;
            } else if (category === 'del') {
                stats.delBlocks++;
                stats.totalDelLines += block.rows.length;
            }
        });
        
        stats.averageBlockSize = blocks.length > 0 
            ? (stats.totalAddLines + stats.totalDelLines) / blocks.length 
            : 0;
        
        return stats;
    }

    return {
        detectBlocks,
        getBlockStats
    };
})();

// ========================================
// BlockMarkerGenerator - ブロックマーカー生成（青枠リサイズ対応版）
// ========================================
const BlockMarkerGenerator = (() => {
    // _Navigation は BlockMarkerGenerator のみが使用するため、IIFE スコープ内に閉じ込める。
    // DiffBlockDetector は _Navigation を参照しないため、モジュールスコープに置く必要はない。
    /** @type {Object|null} Navigation モジュールへの参照（循環依存回避のため遅延注入） */
    let _Navigation = null;

    /**
     * Navigation モジュールを注入する（main.js の初期化時に呼び出す）
     * @param {Object} nav - Navigation モジュール
     * @returns {void}
     */
    function setNavigation(nav) { _Navigation = nav; }

    /** @type {boolean} イベント委譲の初期化フラグ */
    let delegatedEventsInitialized = false;
    
    /** @type {Function|null} クリックイベントハンドラの参照 */
    let clickHandler = null;
    
    /** @type {Function|null} キーボードイベントハンドラの参照 */
    let keydownHandler = null;

    /** @type {Function|null} マウスオーバーイベントハンドラの参照 */
    let mouseoverHandler = null;

    /** @type {Function|null} マウスアウトイベントハンドラの参照 */
    let mouseoutHandler = null;

    /**
     * ブロックマーカーを生成
     * @param {DiffBlock[]} blocks - ブロック配列
     * @param {HTMLTableElement} table - 対象テーブル
     * @returns {void}
     */
    function generateBlockMarkers(blocks, table) {
        Logger.log('=== ブロックマーカー生成開始 ===');

        const { diffContent } = AppState.elements;

        // イベント委譲を初期化（最初の一度だけ）
        if (!delegatedEventsInitialized) {
            initializeDelegatedEvents();
            delegatedEventsInitialized = true;
        }

        clearBlockMarkers();

        // requestAnimationFrame でレイアウト確定後にマーカーを配置
        requestAnimationFrame(() => _placeBlockMarkers(blocks, diffContent));
    }

    /**
     * ブロックマーカーを DOM に配置する（内部処理）
     * generateBlockMarkers() の requestAnimationFrame コールバックから呼ばれる。
     * scrollHeight が 0 の場合は次フレームに再試行し、MAX_RETRY 回で打ち切る
     * （非表示タブ等での無限ループを防止）。
     * @private
     * @param {DiffBlock[]} blocks - ブロック配列
     * @param {HTMLElement} diffContent - スクロール対象要素
     * @param {number} [retryCount=0] - 再試行回数
     * @returns {void}
     */
    function _placeBlockMarkers(blocks, diffContent, retryCount = 0) {
        const MAX_RETRY = 10; // 隠しタブ等でDOMが表示されない場合の無限ループを防ぐ上限
        const contentHeight = diffContent.scrollHeight;

        if (contentHeight === 0) {
            if (retryCount >= MAX_RETRY) {
                Logger.warn(`_placeBlockMarkers: scrollHeight が ${MAX_RETRY} フレーム後も 0 のため配置をスキップ`);
                return;
            }
            requestAnimationFrame(() => _placeBlockMarkers(blocks, diffContent, retryCount + 1));
            return;
        }

        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        // ペインの実際の高さを取得（ヘッダー込みの全体高さ）
        const paneHeight = (paneLeft || paneRight)?.clientHeight || 0;
        if (paneHeight === 0) {
            Logger.warn('_placeBlockMarkers: paneHeight が 0');
            return;
        }

        // .minimap-header (position:sticky) が上部 16px を占有するため
        // マーカー(position:absolute)はその下のエリアにマッピングする:
        //   topPx    = 16 + (rowOffsetTop / contentH) * (paneH - 16)
        //   heightPx = (rowHeight / contentH) * (paneH - 16)  ← 最小値保証あり
        const HEADER_H = 16;
        const availH   = paneHeight - HEADER_H;

        blocks.forEach((block, index) => {
            const firstRow = block.rows[0];
            const lastRow  = block.rows[block.rows.length - 1];
            const top      = firstRow.offsetTop;
            const height   = lastRow.offsetTop + lastRow.offsetHeight - top;

            const topPct    = HEADER_H + (top    / contentHeight) * availH;
            const heightPct = Math.max((height / contentHeight) * availH, CONFIG.MARKER_MIN_HEIGHT_PERCENT / 100 * availH);

            const showLabel = blocks.length <= CONFIG.BLOCK_LABEL_DISPLAY_THRESHOLD;

            // 左ペイン: block に保存した旧ファイル側の実際の色をそのまま使用
            if (block.leftColor && paneLeft) {
                const m = _createBlockMarkerEl(index, block, topPct, heightPct, block.leftColor, showLabel);
                paneLeft.appendChild(m);
            }

            // 右ペイン: block に保存した新ファイル側の実際の色をそのまま使用
            if (block.rightColor && paneRight) {
                const m = _createBlockMarkerEl(index, block, topPct, heightPct, block.rightColor, showLabel);
                paneRight.appendChild(m);
            }
        });

        Logger.log(`✅ ブロックマーカー配置完了: ${blocks.length}個 / scrollHeight: ${contentHeight}`);
    }

    /**
     * ブロックマーカーDOM要素を生成（左右共通）
     * @private
     */
    function _createBlockMarkerEl(index, block, topPct, heightPct, color, showLabel) {
        const marker = document.createElement('div');
        marker.classList.add('marker', 'block-marker');
        marker.dataset.blockId    = block.id;
        marker.dataset.blockIndex = index;
        marker.style.top             = `${topPct}px`;   // px直接指定（ヘッダー16px回避済）
        marker.style.height          = `${heightPct}px`;
        marker.style.backgroundColor = color;

        if (showLabel) {
            const label = document.createElement('span');
            label.className   = 'block-marker-label';
            label.textContent = index + 1;
            marker.appendChild(label);
        }

        marker.setAttribute('tabindex', '0');
        marker.setAttribute('role', 'button');
        marker.setAttribute('aria-label',
            `差分ブロック ${index + 1} (${block.rows.length}行) へジャンプ`);

        return marker;
    }
    
    /**
     * イベント委譲を初期化（一度だけ実行）
     * @private
     * @returns {void}
     */
    function initializeDelegatedEvents() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        // メモリリーク対策: 既存のハンドラを削除
        if (clickHandler) {
            paneLeft?.removeEventListener('click', clickHandler);
            paneRight?.removeEventListener('click', clickHandler);
            Logger.log('既存のblock-marker clickハンドラを削除');
        }
        if (keydownHandler) {
            paneLeft?.removeEventListener('keydown', keydownHandler);
            paneRight?.removeEventListener('keydown', keydownHandler);
            Logger.log('既存のblock-marker keydownハンドラを削除');
        }

        // ハンドラ参照を保持（削除時に使用）
        clickHandler = (e) => {
            const marker = e.target.closest('.marker.block-marker');
            if (marker) {
                handleBlockMarkerClick(marker);
            }
        };

        keydownHandler = (e) => {
            const marker = e.target.closest('.marker.block-marker');
            if (marker && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleBlockMarkerClick(marker);
            }
        };

        // ホバー時: 同じ data-block-index を持つ左右マーカーをまとめてハイライト
        mouseoverHandler = (e) => {
            const m = e.target.closest('.marker.block-marker');
            if (!m) return;
            const idx = m.dataset.blockIndex;
            document.querySelectorAll(`.block-marker[data-block-index="${idx}"]`)
                .forEach(el => el.classList.add('block-marker-hover'));
        };
        mouseoutHandler = (e) => {
            const m = e.target.closest('.marker.block-marker');
            if (!m) return;
            const idx = m.dataset.blockIndex;
            // 同じブロック内の別マーカーへの移動は解除しない
            if (e.relatedTarget?.closest(`.block-marker[data-block-index="${idx}"]`)) return;
            document.querySelectorAll(`.block-marker[data-block-index="${idx}"]`)
                .forEach(el => el.classList.remove('block-marker-hover'));
        };

        paneLeft?.addEventListener('click',     clickHandler);
        paneLeft?.addEventListener('keydown',   keydownHandler);
        paneLeft?.addEventListener('mouseover', mouseoverHandler);
        paneLeft?.addEventListener('mouseout',  mouseoutHandler);
        paneRight?.addEventListener('click',    clickHandler);
        paneRight?.addEventListener('keydown',  keydownHandler);
        paneRight?.addEventListener('mouseover', mouseoverHandler);
        paneRight?.addEventListener('mouseout',  mouseoutHandler);

        Logger.log('✅ Block-marker event delegation initialized (click/keydown/hover)');
    }

    /**
     * ブロックマーカークリック処理
     * @private
     * @param {HTMLElement} marker - クリックされたマーカー
     * @returns {void}
     */
    function handleBlockMarkerClick(marker) {
        const index = parseInt(marker.dataset.blockIndex, 10);
        if (isNaN(index) || index < 0 || index >= AppState.diffBlocks.length) {
            Logger.warn('Invalid block marker index:', index);
            return;
        }
        
        const block = AppState.diffBlocks[index];
        jumpToBlock(index, block);
    }
    
    /**
     * 指定ブロックにジャンプ
     * @private
     * @param {number} index - ブロックインデックス
     * @param {DiffBlock} block - ブロックオブジェクト
     * @returns {void}
     */
    function jumpToBlock(index, block) {
        Logger.log(`ブロック ${index + 1} にジャンプ`);
        
        if (!block || !block.rows || block.rows.length === 0) {
            Logger.error('無効なブロックデータ:', index);
            return;
        }
        
        _Navigation?.clearCurrentDiffHighlight();
        
        _createBlockHighlight(block);
        
        const firstRow = block.rows[0];
        
        try {
            firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            Logger.error('スクロールエラー:', error);
        }
        
        AppState.currentDiffIndex = index;
        AppState.isNavigatingToDiff = true;
        
        // 左右両ペインのマーカーをまとめて選択状態にする
        document.querySelectorAll('.marker-selected').forEach(m => m.classList.remove('marker-selected'));
        document.querySelectorAll(`.block-marker[data-block-index="${index}"]`)
            .forEach(m => m.classList.add('marker-selected'));
        
        setTimeout(() => {
            AppState.isNavigatingToDiff = false;
        }, CONFIG.NAVIGATION_COMPLETE_DELAY);
        
        updateBlockInfo();
    }
    
    /**
     * ブロックハイライトを作成
     * @private
     * @param {DiffBlock} block - ブロックオブジェクト
     * @returns {void}
     */
    function _createBlockHighlight(block) {
        const firstRow = block.rows[0];
        const lastRow = block.rows[block.rows.length - 1];
        
        const table = firstRow.closest('table');
        if (!table) return;
        
        const container = table.parentElement;
        if (!container) return;
        
        // 既存のハイライトを削除
        const oldWrapper = container.querySelector('.block-highlight-wrapper');
        if (oldWrapper) oldWrapper.remove();
        
        const containerPosition = window.getComputedStyle(container).position;
        if (containerPosition === 'static') {
            container.style.position = 'relative';
        }
        
        const tableRect = table.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const firstRowRect = firstRow.getBoundingClientRect();
        const lastRowRect = lastRow.getBoundingClientRect();
        
        const top = firstRowRect.top - containerRect.top + container.scrollTop;
        const height = lastRowRect.bottom - firstRowRect.top;
        const left = tableRect.left - containerRect.left;
        const width = tableRect.width;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'block-highlight-wrapper';
        wrapper.style.position = 'absolute';
        wrapper.style.left = `${left}px`;
        wrapper.style.top = `${top}px`;
        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
        wrapper.style.pointerEvents = 'none';
        wrapper.style.zIndex = '5';
        
        // ブロック情報を data 属性に保存（リサイズ時に使用）
        wrapper.dataset.blockIndex = AppState.currentDiffIndex;
        
        container.appendChild(wrapper);
    }
    
    /**
     * ブロックハイライトを更新（リサイズ時用）
     * @returns {void}
     */
    function updateBlockHighlight() {
        const wrapper = document.querySelector('.block-highlight-wrapper');
        if (!wrapper) return;
        
        const blockIndex = parseInt(wrapper.dataset.blockIndex, 10);
        if (isNaN(blockIndex) || blockIndex < 0 || blockIndex >= AppState.diffBlocks.length) {
            return;
        }
        
        const block = AppState.diffBlocks[blockIndex];
        if (!block || !block.rows || block.rows.length === 0) {
            return;
        }
        
        const firstRow = block.rows[0];
        const lastRow = block.rows[block.rows.length - 1];
        const table = firstRow.closest('table');
        if (!table) return;
        
        const container = table.parentElement;
        if (!container) return;
        
        const tableRect = table.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const firstRowRect = firstRow.getBoundingClientRect();
        const lastRowRect = lastRow.getBoundingClientRect();
        
        const top = firstRowRect.top - containerRect.top + container.scrollTop;
        const height = lastRowRect.bottom - firstRowRect.top;
        const left = tableRect.left - containerRect.left;
        const width = tableRect.width;
        
        wrapper.style.left = `${left}px`;
        wrapper.style.top = `${top}px`;
        wrapper.style.width = `${width}px`;
        wrapper.style.height = `${height}px`;
        
        Logger.log('✅ ブロックハイライトの位置・サイズを更新');
    }
    
    /**
     * ブロック情報表示を更新
     * @private
     * @returns {void}
     */
    function updateBlockInfo() {
        if (!AppState.diffBlocks || AppState.diffBlocks.length === 0) {
            AppState.elements.diffInfo.textContent = '差分: 0 / 0';
            CSSManager.showElement(AppState.elements.diffInfo, 'info-visible', 'info-hidden');
            return;
        }
        
        CSSManager.showElement(AppState.elements.diffInfo, 'info-visible', 'info-hidden');
        
        const current = (AppState.currentDiffIndex >= 0 && 
                        AppState.currentDiffIndex < AppState.diffBlocks.length) 
            ? AppState.currentDiffIndex + 1 
            : 0;
        
        AppState.elements.diffInfo.textContent = `差分: ${current} / ${AppState.diffBlocks.length}`;
    }
    
    /**
     * ブロックマーカーをクリア
     * @private
     * @returns {void}
     */
    function clearBlockMarkers() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        // イベント委譲モデルのため、マーカー要素への個別リスナー登録は行っていない。
        // DOM から remove() するだけでよい。
        [paneLeft, paneRight].forEach(pane => {
            if (!pane) return;
            pane.querySelectorAll('.block-marker').forEach(marker => marker.remove());
        });

        Logger.log('✅ Block markers cleared (left + right panes)');
    }

    /**
     * イベント委譲のクリーンアップ（メモリリーク対策の要）
     * @returns {void}
     */
    function cleanupDelegation() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        if (!paneLeft && !paneRight) {
            Logger.warn('locationPane (left/right) not found during block-marker cleanup');
            return;
        }

        if (clickHandler) {
            paneLeft?.removeEventListener('click',     clickHandler);
            paneRight?.removeEventListener('click',    clickHandler);
            clickHandler = null;
            Logger.log('✅ block-marker clickハンドラを削除しました');
        }

        if (keydownHandler) {
            paneLeft?.removeEventListener('keydown',  keydownHandler);
            paneRight?.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
            Logger.log('✅ block-marker keydownハンドラを削除しました');
        }

        if (mouseoverHandler) {
            paneLeft?.removeEventListener('mouseover',  mouseoverHandler);
            paneRight?.removeEventListener('mouseover', mouseoverHandler);
            mouseoverHandler = null;
            Logger.log('✅ block-marker mouseoverハンドラを削除しました');
        }

        if (mouseoutHandler) {
            paneLeft?.removeEventListener('mouseout',  mouseoutHandler);
            paneRight?.removeEventListener('mouseout', mouseoutHandler);
            mouseoutHandler = null;
            Logger.log('✅ block-marker mouseoutハンドラを削除しました');
        }

        delegatedEventsInitialized = false;
        Logger.log('✅ Block-marker event delegation cleaned up');
    }

    /**
     * 完全クリーンアップ（マーカー削除 + イベントリスナー削除）
     * @returns {void}
     */
    function cleanup() {
        clearBlockMarkers();
        cleanupDelegation();
        Logger.log('✅ BlockMarkerGenerator completely cleaned up');
    }

    return {
        generateBlockMarkers,
        cleanup,
        cleanupDelegation,
        updateBlockHighlight,
        jumpToBlock,
        updateBlockInfo,
        clearBlockMarkers,
        setNavigation
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.DiffBlockDetector と WinMergeViewer.BlockMarkerGenerator としてアクセス可能

export { DiffBlockDetector, BlockMarkerGenerator };