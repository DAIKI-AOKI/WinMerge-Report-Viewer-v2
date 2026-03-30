/**
 * MarkerManager - 行単位マーカー管理モジュール（デバッグ専用・孤立ファイル）
 * 依存: config.js, state.js, utils.js, table-processor.js
 *
 * @fileoverview 差分行マーカーの生成と管理を行うモジュール。
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ このファイルは _legacy/ フォルダに隔離されています
 *
 * 理由:
 *   1. どのモジュールからも import されておらず、実行パスから切り離された
 *      「孤立ファイル」のため、誤って本番コードに混入しないよう隔離しました。
 *
 *   2. 参照する AppState プロパティが state.js から削除済みのため、
 *      import・実行すると即座に実行時エラーになります。
 *        - AppState.diffRows         （state.js から削除済み）
 *        - AppState.cachedMarkerData （state.js から削除済み）
 *
 * 再利用する場合は:
 *   - state.js に上記プロパティを復元する、またはこのファイルを書き直す
 *   - _legacy/ から js/ に移動する
 * ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️ 通常運用ではブロックモード（diff-detector.js の BlockMarkerGenerator）を使用する。
 *    このモジュールはデバッグ目的（?debug=true 時）にのみ MarkerModeToggle から呼び出される。
 *    本番ビルドでは file-handler.js の _stepMarker() から直接呼ばれることはない。
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { Utils, CSSManager } from './utils.js';
import { TableProcessor } from './table-processor.js';

let _Navigation = null;
function setNavigation(nav) { _Navigation = nav; }

const MarkerManager = (() => {
    /** @type {boolean} イベント委譲の初期化フラグ */
    let delegatedEventsInitialized = false;
    
    /** @type {Function|null} クリックイベントハンドラの参照 */
    let clickHandler = null;
    
    /** @type {Function|null} キーボードイベントハンドラの参照 */
    let keydownHandler = null;

    /**
     * マーカーを生成
     * @param {HTMLTableElement} table - 対象テーブル
     * @returns {void}
     */
    function generate(table) {
        const tableHash = Utils.computeTableHash(table);
        const displayedRows = table.querySelectorAll('tr');
        const { locationPaneLeft, locationPaneRight, diffContent } = AppState.elements;

        if (!delegatedEventsInitialized) {
            initializeDelegatedEvents();
            delegatedEventsInitialized = true;
        }

        if (AppState.cachedMarkerData.tableHash === tableHash) {
            Logger.log('キャッシュ済みマーカーを再利用:', AppState.cachedMarkerData.markers.length);
            cleanup();
            AppState.diffRows = AppState.cachedMarkerData.diffRows.map(r => ({ ...r }));
            AppState.cachedMarkerData.markers.forEach(marker => {
                // data-pane 属性で左右を振り分けて再挿入
                if (marker.dataset.pane === 'right') {
                    locationPaneRight?.appendChild(marker);
                } else {
                    locationPaneLeft?.appendChild(marker);
                }
            });
            requestAnimationFrame(() => {
                _placeLineMarkers(AppState.cachedMarkerData.markers, diffContent);
            });
            updateDiffInfo();
            return;
        }

        cleanup();
        AppState.diffRows = [];
        const newMarkers = [];

        displayedRows.forEach((row) => {
            const usedColor = TableProcessor.getRowBackgroundColor(row);
            if (!usedColor) return;

            const diffInfo = {
                element: row,
                index: AppState.diffRows.length,
                textPreview: row.textContent
                    .replace(/\s+/g, ' ')
                    .substring(0, CONFIG.TEXT_PREVIEW_MAX_LENGTH),
                color: usedColor
            };
            AppState.diffRows.push(diffInfo);

            // 左右両ペインにマーカーを作成（ラインモードは全て両ペイン表示）
            ['left', 'right'].forEach(side => {
                const marker = document.createElement('div');
                marker.classList.add('marker', 'line-marker');
                marker.style.top = '0%';
                marker.style.height = '0%';
                marker.style.backgroundColor = CONFIG.MARKER_COLOR;
                marker.dataset.index = diffInfo.index;
                marker.dataset.pane  = side;
                marker.setAttribute('tabindex', '0');
                marker.setAttribute('role', 'button');
                marker.setAttribute('aria-label', `差分 ${diffInfo.index + 1} へジャンプ`);

                if (side === 'left') {
                    locationPaneLeft?.appendChild(marker);
                } else {
                    locationPaneRight?.appendChild(marker);
                }
                newMarkers.push(marker);
            });
        });

        requestAnimationFrame(() => {
            _placeLineMarkers(newMarkers, diffContent);
        });

        AppState.cachedMarkerData = {
            tableHash: tableHash,
            diffRows: AppState.diffRows.map(r => ({ ...r })),
            markers: newMarkers
        };

        Logger.log('マーカー生成完了(キャッシュ更新)', AppState.diffRows.length);
        updateDiffInfo();
    }

    /**
     * イベント委譲を初期化（一度だけ実行）
     * @private
     * @returns {void}
     */
    function initializeDelegatedEvents() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        if (clickHandler) {
            paneLeft?.removeEventListener('click', clickHandler);
            paneRight?.removeEventListener('click', clickHandler);
            Logger.log('既存のline-marker clickハンドラを削除');
        }
        if (keydownHandler) {
            paneLeft?.removeEventListener('keydown', keydownHandler);
            paneRight?.removeEventListener('keydown', keydownHandler);
            Logger.log('既存のline-marker keydownハンドラを削除');
        }

        clickHandler = (e) => {
            const marker = e.target.closest('.marker.line-marker');
            if (marker) handleMarkerClick(marker);
        };

        keydownHandler = (e) => {
            const marker = e.target.closest('.marker.line-marker');
            if (marker && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleMarkerClick(marker);
            }
        };

        paneLeft?.addEventListener('click', clickHandler);
        paneLeft?.addEventListener('keydown', keydownHandler);
        paneRight?.addEventListener('click', clickHandler);
        paneRight?.addEventListener('keydown', keydownHandler);

        Logger.log('✅ Line-marker event delegation initialized (left + right panes)');
    }

    /**
     * マーカークリック処理
     * @private
     * @param {HTMLElement} marker - クリックされたマーカー
     * @returns {void}
     */
    function handleMarkerClick(marker) {
        const index = parseInt(marker.dataset.index, 10);
        if (isNaN(index) || index < 0 || index >= AppState.diffRows.length) {
            Logger.warn('Invalid marker index:', index);
            return;
        }
        
        const diffInfo = AppState.diffRows[index];
        if (!diffInfo || !diffInfo.element) {
            Logger.warn('Diff info not found for index:', index);
            return;
        }
        
        // 前回のハイライト（.current-diff クラス + インラインスタイル）を一括クリア。
        // clearCurrentDiffHighlight() は .current-diff のみ対象のため、
        // インラインスタイルの boxShadow は先にここで明示的にクリアする。
        document.querySelectorAll('tr[style*="box-shadow"]').forEach(tr => {
            tr.style.boxShadow = '';
            tr.style.borderRadius = '';
        });
        _Navigation?.clearCurrentDiffHighlight();
        AppState.currentDiffIndex = index;
        
        const row = diffInfo.element;
        row.classList.remove('current-diff');
        // clear の後にセットすることで、自己消去を防ぐ
        row.style.boxShadow = CONFIG.HIGHLIGHT_BOX_SHADOW;
        row.style.borderRadius = CONFIG.HIGHLIGHT_BORDER_RADIUS;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        _Navigation?.highlightSelectedMarker(index);
        marker.blur();
        
        AppState.isNavigatingToDiff = true;
        setTimeout(() => {
            AppState.isNavigatingToDiff = false;
        }, CONFIG.NAVIGATION_COMPLETE_DELAY);
        
        updateDiffInfo();
    }

    /**
     * ラインマーカーの top / height をレイアウト確定後に設定する
     * rAF コールバック内から呼び出すことで offsetTop の早期読み取りを防ぐ。
     * @private
     * @param {HTMLElement[]} markers - 配置済みマーカー要素の配列
     * @param {HTMLElement} diffContent - スクロールコンテナ
     * @returns {void}
     */
    function _placeLineMarkers(markers, diffContent, retryCount = 0) {
        const MAX_RETRY = 10; // 隠しタブ等でDOMが表示されない場合の無限ループを防ぐ上限
        const contentHeight = diffContent.scrollHeight;
        if (contentHeight === 0) {
            if (retryCount >= MAX_RETRY) {
                Logger.warn(`_placeLineMarkers: scrollHeight が ${MAX_RETRY} フレーム後も 0 のため配置をスキップ`);
                return;
            }
            // レイアウトがまだ確定していない場合は次フレームに再試行
            requestAnimationFrame(() => _placeLineMarkers(markers, diffContent, retryCount + 1));
            return;
        }
        markers.forEach(marker => {
            const index = parseInt(marker.dataset.index, 10);
            const diffInfo = AppState.diffRows[index];
            if (!diffInfo || !diffInfo.element) return;
            const row = diffInfo.element;
            marker.style.top    = `${(row.offsetTop    / contentHeight) * 100}%`;
            marker.style.height = `${Math.max(
                CONFIG.MARKER_MIN_HEIGHT_PERCENT,
                (row.offsetHeight / contentHeight) * 100
            )}%`;
        });
        Logger.log('✅ ラインマーカーの位置を rAF 後に確定');
    }

    /**
     * すべてのマーカーをクリーンアップ
     * @returns {void}
     */
    function cleanup() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        [paneLeft, paneRight].forEach(pane => {
            if (!pane) return;
            pane.querySelectorAll('.marker.line-marker').forEach(marker => {
                const listeners = AppState.markerEventListeners?.get(marker);
                if (listeners) {
                    if (listeners.click)   marker.removeEventListener('click',   listeners.click);
                    if (listeners.keydown) marker.removeEventListener('keydown', listeners.keydown);
                    AppState.markerEventListeners.delete(marker);
                }
                marker.remove();
            });
        });

        AppState.markerEventListeners = new WeakMap();
        Logger.log('✅ Line markers cleaned up (left + right panes)');
    }

    /**
     * 差分情報表示を更新
     * @returns {void}
     */
    function updateDiffInfo() {
        if (AppState.diffRows.length === 0) {
            AppState.elements.diffInfo.textContent = '差分: 0 / 0';
            CSSManager.showElement(AppState.elements.diffInfo, 'info-visible', 'info-hidden');
            return;
        }
        CSSManager.showElement(AppState.elements.diffInfo, 'info-visible', 'info-hidden');
        const current = AppState.currentDiffIndex >= 0 ? AppState.currentDiffIndex + 1 : 0;
        AppState.elements.diffInfo.textContent = `差分: ${current} / ${AppState.diffRows.length}`;
    }

    /**
     * イベント委譲のクリーンアップ（メモリリーク対策の要）
     * @returns {void}
     */
    function cleanupDelegation() {
        const paneLeft  = AppState.elements.locationPaneLeft;
        const paneRight = AppState.elements.locationPaneRight;

        if (!paneLeft && !paneRight) {
            Logger.warn('locationPane (left/right) not found during line-marker cleanup');
            return;
        }

        if (clickHandler) {
            paneLeft?.removeEventListener('click', clickHandler);
            paneRight?.removeEventListener('click', clickHandler);
            clickHandler = null;
            Logger.log('✅ line-marker clickハンドラを削除しました');
        }

        if (keydownHandler) {
            paneLeft?.removeEventListener('keydown', keydownHandler);
            paneRight?.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
            Logger.log('✅ line-marker keydownハンドラを削除しました');
        }

        delegatedEventsInitialized = false;
        Logger.log('✅ Line-marker event delegation cleaned up');
    }

    // 公開API
    return {
        generate,
        cleanup,
        updateDiffInfo,
        cleanupDelegation,
        setNavigation
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.MarkerManager としてアクセス可能

export { MarkerManager };