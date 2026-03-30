/**
 * TableProcessor - テーブル処理モジュール（IntersectionObserver メモリリーク対策版 + リサイズ対応）
 * 依存: config.js, state.js, utils.js
 * 
 * @fileoverview テーブルの加工と固定ヘッダー管理
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { CSSManager } from './utils.js';

const TableProcessor = (() => {
    /**
     * テーブルの各行に右端バーを追加
     * @param {HTMLTableElement} table - 対象テーブル
     * @returns {void}
     */
    function addRightBars(table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const isHeaderRow = row.querySelector('th');
            const rightBarCell = document.createElement(isHeaderRow ? 'th' : 'td');
            rightBarCell.className = 'added-right-bar';
            rightBarCell.innerHTML = '&nbsp;';
            row.appendChild(rightBarCell);
        });
    }

    /**
     * 固定ヘッダーをセットアップ
     * @param {HTMLTableElement} table - 元のテーブル
     * @returns {void}
     */
    function setupFixedHeader(table) {
        const firstRow = table.querySelector('tr');
        if (!firstRow) return;
        
        AppState.elements.fixedHeaderRow.innerHTML = '';
        firstRow.querySelectorAll('th').forEach((originalTh) => {
            const newTh = document.createElement('th');
            newTh.textContent = originalTh.textContent;
            
            const allowedAttributes = ['class', 'colspan', 'rowspan'];
            allowedAttributes.forEach(attrName => {
                if (originalTh.hasAttribute(attrName)) {
                    const attrValue = originalTh.getAttribute(attrName);
                    const sanitizedValue = attrValue
                        .replace(/[<>'"]/g, '')
                        .replace(/javascript:/gi, '')
                        .replace(/on\w+/gi, '')
                        .trim();
                    if (sanitizedValue && sanitizedValue.length < 200) {
                        newTh.setAttribute(attrName, sanitizedValue);
                    }
                }
            });
            
            newTh.setAttribute('scope', 'col');
            
            Array.from(originalTh.attributes).forEach(attr => {
                if (attr.name.startsWith('aria-') || attr.name.startsWith('data-')) {
                    let attrValue = attr.value;
                    const sanitizedValue = attrValue.replace(/[<>'"]/g, '').trim();
                    newTh.setAttribute(attr.name, sanitizedValue);
                }
            });
            
            AppState.elements.fixedHeaderRow.appendChild(newTh);
        });
    }

    /**
     * 固定ヘッダーの位置を更新
     * @param {HTMLTableElement} originalTable - 元のテーブル
     * @returns {void}
     */
    function updateFixedHeaderPosition(originalTable) {
        const fixedTable = AppState.elements.fixedHeader.querySelector('table');
        if (!originalTable || !fixedTable) return;
        
        const tableRect = originalTable.getBoundingClientRect();
        CSSManager.setVariable('fixed-header-left', `${tableRect.left}px`);
        CSSManager.setVariable('fixed-header-width', `${tableRect.width}px`);
        
        const originalThs = originalTable.querySelectorAll('tr:first-child th');
        const fixedThs = fixedTable.querySelectorAll('tr:first-child th');
        
        originalThs.forEach((originalTh, index) => {
            if (!fixedThs[index]) return;
            if (index === originalThs.length - 1 && originalTh.classList.contains('added-right-bar')) {
                fixedThs[index].style.width = `${CONFIG.RIGHT_BAR_WIDTH}px`;
            } else {
                const thRect = originalTh.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                let adjustedWidth;
                if (windowWidth <= 600) {
                    adjustedWidth = thRect.width;
                } else if (windowWidth <= 750) {
                    adjustedWidth = thRect.width - 17;
                } else {
                    adjustedWidth = Math.max(CONFIG.MIN_COLUMN_WIDTH, thRect.width - CONFIG.HEADER_ADJUSTMENT);
                }
                fixedThs[index].style.width = `${adjustedWidth}px`;
            }
        });
    }

    /**
     * IntersectionObserver を完全にクリーンアップ（メモリリーク対策）
     * @private
     * @returns {void}
     */
    function cleanupIntersectionObserver() {
        if (AppState.intersectionObserver) {
            try {
                // ★メモリリーク対策1: すべての監視を解除
                AppState.intersectionObserver.disconnect();
                
                // ★メモリリーク対策2: 参照をクリア
                AppState.intersectionObserver = null;
                
                Logger.log('✅ IntersectionObserver cleaned up completely');
            } catch (error) {
                Logger.warn('IntersectionObserver cleanup error:', error);
                // エラーが発生しても参照はクリア
                AppState.intersectionObserver = null;
            }
        }
    }

    /**
     * IntersectionObserverをセットアップして、ヘッダーの表示/非表示を制御
     * （メモリリーク対策強化版 + リサイズ対応）
     * @returns {void}
     */
    function setupIntersectionObserver() {
        // ★メモリリーク対策3: 既存の observer を完全にクリーンアップ
        cleanupIntersectionObserver();
        
        try {
            // ★メモリリーク対策4: コールバック関数を変数に保存（デバッグ用）
            const observerCallback = (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // ヘッダー行が見えている → 固定ヘッダーを非表示
                        CSSManager.hideElement(
                            AppState.elements.fixedHeader, 
                            'fixed-header-visible', 
                            'fixed-header-hidden'
                        );
                        entry.target.style.visibility = 'visible';
                    } else {
                        // ヘッダー行が見えていない → 固定ヘッダーを表示
                        const firstTable = AppState.elements.viewer.querySelector('table');
                        if (firstTable && entry.target === firstTable.querySelector('tr')) {
                            updateFixedHeaderPosition(firstTable);
                            CSSManager.showElement(
                                AppState.elements.fixedHeader, 
                                'fixed-header-visible', 
                                'fixed-header-hidden'
                            );
                            entry.target.style.visibility = 'hidden';
                        }
                    }
                });
            };
            
            const observerOptions = {
                root: AppState.elements.diffContent,
                rootMargin: `-${CONFIG.HEADER_VISIBILITY_THRESHOLD}px 0px 0px 0px`,
                threshold: 0
            };
            
            // ★メモリリーク対策5: 新しい observer を作成
            AppState.intersectionObserver = new IntersectionObserver(
                observerCallback,
                observerOptions
            );
            
            // ★メモリリーク対策6: 監視対象を登録
            const firstTable = AppState.elements.viewer.querySelector('table');
            if (firstTable) {
                const headerRow = firstTable.querySelector('tr');
                if (headerRow) {
                    AppState.intersectionObserver.observe(headerRow);
                    Logger.log('✅ IntersectionObserver observing header row');
                } else {
                    Logger.warn('Header row not found for IntersectionObserver');
                    cleanupIntersectionObserver();
                }
            } else {
                Logger.warn('Table not found for IntersectionObserver');
                cleanupIntersectionObserver();
            }
            
            // ★修正: ウィンドウリサイズ時に固定ヘッダーの幅を更新
            setupResizeHandler(firstTable);
            
        } catch (error) {
            Logger.error('IntersectionObserver setup failed:', error);
            // エラーが発生した場合は observer をクリーンアップ
            cleanupIntersectionObserver();
        }
    }
    
    function setupResizeHandler(table) {
        if (!table) return;
        
        // 既存のリサイズハンドラーをクリーンアップ
        if (AppState.eventHandlers.debouncedResize) {
            window.removeEventListener('resize', AppState.eventHandlers.debouncedResize);
            AppState.eventHandlers.debouncedResize = null;
        }
        
        if (AppState.eventHandlers.resizeTimeout) {
            clearTimeout(AppState.eventHandlers.resizeTimeout);
            AppState.eventHandlers.resizeTimeout = null;
        }
        
        // デバウンス付きリサイズハンドラー
        AppState.eventHandlers.debouncedResize = () => {
            if (AppState.eventHandlers.resizeTimeout) {
                clearTimeout(AppState.eventHandlers.resizeTimeout);
            }
            
            AppState.eventHandlers.resizeTimeout = setTimeout(() => {
                // 固定ヘッダーが表示されている場合のみ更新
                const fixedHeader = AppState.elements.fixedHeader;
                if (fixedHeader && fixedHeader.classList.contains('fixed-header-visible')) {
                    const currentTable = AppState.elements.viewer.querySelector('table');
                    if (currentTable) {
                        updateFixedHeaderPosition(currentTable);
                        Logger.log('✅ 固定ヘッダーの幅をリサイズに合わせて更新');
                    }
                }
                
                // ブロックハイライト枠の位置・サイズを更新
                // markerResizeCallback はブロックモード確立後に file-handler.js が登録する
                if (typeof AppState.eventHandlers.markerResizeCallback === 'function') {
                    AppState.eventHandlers.markerResizeCallback();
                }
            }, CONFIG.RESIZE_DEBOUNCE_DELAY);
        };
        
        window.addEventListener('resize', AppState.eventHandlers.debouncedResize);
        Logger.log('✅ リサイズハンドラーを設定しました');
    }

    /**
     * td 要素の背景色を取得する内部ユーティリティ。
     * インラインスタイルの HEX（file:// 環境）と getComputedStyle の両方に対応。
     * 中立色（白・薄グレー）は null を返す。
     * @private
     * @param {HTMLTableCellElement} td
     * @returns {string|null} "rgb(r,g,b)" 形式 または null
     */
    function _getTdBgColor(td) {
        function hexToRgb(hex) {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
        }
        function isNeutral(r, g, b) {
            // 閾値 240: WinMerge の最も薄い差分色 rgb(241,226,173) の最小値が 173 であり、
            // 白・薄グレー（r,g,b すべて 240 以上）とは十分に区別できる。
            // ⚠️ CONFIG.DIFF_COLOR_MAP の色を変更する場合は、最も薄い色の最小チャンネル値が
            //    240 を超えないことを確認すること。
            return (r >= 240 && g >= 240 && b >= 240);
        }
        // ① インラインスタイルの HEX（file:// 環境対応）
        const inline = td.style.backgroundColor;
        if (inline && inline.startsWith('#')) {
            const rgb = hexToRgb(inline);
            if (rgb && !isNeutral(rgb.r, rgb.g, rgb.b)) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        }
        // ② getComputedStyle
        const bg = window.getComputedStyle(td).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
                const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
                if (!isNeutral(r, g, b)) return bg;
            }
        }
        return null;
    }

    /**
     * 行の左列（旧ファイル）・右列（新ファイル）それぞれの背景色を返す。
     *
     * WinMerge HTML レポートの tr 構造（バージョンによって異なる）:
     *   パターンA: [td.title 行番号(旧)] [td 内容(旧)] [td.title 行番号(新)] [td 内容(新)] [td.added-right-bar]
     *   パターンB: .title クラスなし、colspan を使う構造
     *
     * .title と .added-right-bar を除いた td が 4 つある場合は
     *   index 0,1 = 旧ファイル側、index 2,3 = 新ファイル側
     * 2 つの場合は index 0 = 旧、index 1 = 新
     *
     * さらに、テーブル全体の列数（ヘッダー行の th 数）を基準に
     * left/right を判定することで .title クラス依存を排除する。
     *
     * @param {HTMLTableRowElement} row
     * @returns {{ left: string|null, right: string|null }}
     */
    function getRowColors(row) {
        // added-right-bar を除いた全 td を取得
        const allTds = Array.from(row.querySelectorAll('td')).filter(
            td => !td.classList.contains('added-right-bar')
        );
        const n = allTds.length;

        if (n === 0) return { left: null, right: null };

        // td が 1 本だけ（ヘッダー行・区切り行）の場合
        if (n === 1) {
            return { left: _getTdBgColor(allTds[0]), right: null };
        }

        // 左半分の中から有色 td を探す（旧ファイル側）
        // Math.floor を使うことで奇数列の場合も左側が多くならず対称に近い分割になる
        // n=4→half=2(2/2), n=3→half=1(1/2), n=5→half=2(2/3) ← 右に余分を渡す
        const half = Math.floor(n / 2);
        let leftColor = null;
        for (let i = 0; i < half; i++) {
            const c = _getTdBgColor(allTds[i]);
            if (c) { leftColor = c; break; }
        }

        // 右半分の中から有色 td を探す（新ファイル側）
        let rightColor = null;
        for (let i = half; i < n; i++) {
            const c = _getTdBgColor(allTds[i]);
            if (c) { rightColor = c; break; }
        }

        return { left: leftColor, right: rightColor };
    }

    /**
     * 行の背景色を取得（差分行の検出用・後方互換）。
     * 左右どちらかに有色の td があればその色を返す。
     * ミニマップ色には getRowColors() を使うこと。
     *
     * @param {HTMLTableRowElement} row
     * @returns {string|null} "rgb(r,g,b)" または null
     */
    function getRowBackgroundColor(row) {
        const { left, right } = getRowColors(row);
        return left || right || null;
    }

    // 公開API
    return {
        addRightBars,
        setupFixedHeader,
        updateFixedHeaderPosition,
        setupIntersectionObserver,
        setupResizeHandler,
        cleanupIntersectionObserver,
        getRowBackgroundColor,
        getRowColors,
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.TableProcessor としてアクセス可能

export { TableProcessor };