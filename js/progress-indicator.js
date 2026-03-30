/**
 * js/progress-indicator.js - プログレスインジケーター
 * 
 * 依存関係: なし（独立したモジュール）
 * 
 * @fileoverview ファイル処理中のプログレス表示を管理するクラス
 */

'use strict';

/**
 * @typedef {Object} ProcessingStep
 * @property {string} label - ステップのラベル
 * @property {number[]} range - 進捗率の範囲 [開始%, 終了%]
 */

/**
 * プログレスインジケータークラス
 * ファイル処理中の進捗状況を視覚的に表示
 * 
 * @class ProgressIndicator
 */
class ProgressIndicator {
    /**
     * ProgressIndicatorを作成
     */
    constructor() {
        /** @type {HTMLElement|null} オーバーレイ要素 */
        this.overlay = null;
        
        /** @type {HTMLElement|null} プログレスバー要素 */
        this.progressBar = null;
        
        /** @type {HTMLElement|null} ステータステキスト要素 */
        this.statusText = null;
        
        /** @type {HTMLElement|null} パーセンテージテキスト要素 */
        this.percentText = null;
        
        /** @type {number|null} hide() の遅延タイムアウトID（フェードアウト開始まで） */
        this.hideTimeout = null;
        
        /** @type {number|null} transitionend 未発火時のフォールバックタイムアウトID */
        this.fallbackTimeout = null;
        
        /** @type {Function|null} transitionend イベントハンドラの参照 */
        this.transitionEndHandler = null;
        
        /** @type {Object.<string, ProcessingStep>} 処理ステップの定義 */
        this.steps = {
            read: { label: 'ファイル読み込み', range: [0, 20] },
            sanitize: { label: 'HTML解析', range: [20, 40] },
            parse: { label: 'DOM解析', range: [40, 50] },
            detect: { label: '差分検出', range: [50, 70] },
            marker: { label: 'マーカー生成', range: [70, 90] },
            render: { label: '表示準備', range: [90, 100] }
        };
    }

    /**
     * オーバーレイDOMを生成
     * @returns {HTMLElement} 生成されたオーバーレイ要素
     */
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'simple-progress-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'ファイル処理中');

        overlay.innerHTML = `
            <div class="simple-progress-container">
                <div class="simple-progress-icon">
                    <i class="fas fa-file-code" aria-hidden="true"></i>
                </div>
                <div class="simple-progress-title">処理中...</div>
                <div class="simple-progress-bar-wrapper">
                    <div class="simple-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="simple-progress-info">
                    <span class="simple-progress-status">準備中</span>
                    <span class="simple-progress-percent">0%</span>
                </div>
            </div>
        `;

        // 参照を保持
        this.overlay = overlay;
        this.progressBar = overlay.querySelector('.simple-progress-bar');
        this.statusText = overlay.querySelector('.simple-progress-status');
        this.percentText = overlay.querySelector('.simple-progress-percent');

        return overlay;
    }

    /**
     * プログレスインジケーターを表示
     * @param {string} [title='処理中...'] - タイトル（オプション）
     * @returns {void}
     */
    show(title = '処理中...') {
        // 再表示時に前回の hide() タイムアウトが残っていればキャンセル
        this.clearTimeouts();
        
        if (!this.overlay) {
            this.createOverlay();
        }

        // タイトル更新
        const titleElement = this.overlay.querySelector('.simple-progress-title');
        if (titleElement && title) {
            titleElement.textContent = title;
        }

        // DOMに追加
        document.body.appendChild(this.overlay);

        // アニメーション用に少し遅延
        requestAnimationFrame(() => {
            if (this.overlay) {
                this.overlay.classList.add('active');
            }
        });

        // 初期状態にリセット
        this.reset();
    }

    /**
     * プログレスを更新
     * @param {number} progress - 進捗率 (0-100)
     * @returns {void}
     */
    update(progress) {
        if (!this.overlay || !this.progressBar) return;

        // 進捗率を0-100に制限
        const clampedProgress = Math.max(0, Math.min(100, progress));

        // プログレスバー更新
        this.progressBar.style.width = `${clampedProgress}%`;
        this.progressBar.setAttribute('aria-valuenow', clampedProgress.toString());

        // パーセンテージ表示更新
        if (this.percentText) {
            this.percentText.textContent = `${Math.round(clampedProgress)}%`;
        }
    }

    /**
     * 指定したステップの進捗を更新
     * @param {string} stepId - ステップID ('read'|'sanitize'|'parse'|'detect'|'marker'|'render')
     * @param {number} substep - サブステップの進捗 (0-100)
     * @returns {void}
     */
    updateStepProgress(stepId, substep) {
        const stepData = this.steps[stepId];
        if (!stepData) {
            console.warn(`Unknown step ID: ${stepId}`);
            return;
        }

        const [start, end] = stepData.range;
        const progress = start + ((end - start) * substep / 100);

        this.update(progress);

        // ステータステキスト更新
        if (this.statusText && substep < 100) {
            this.statusText.textContent = stepData.label;
        } else if (this.statusText && substep === 100) {
            this.statusText.textContent = stepData.label + '完了';
        }
    }

    /**
     * プログレスインジケーターを非表示
     * @param {number} [delay=300] - フェードアウト前の遅延時間（ミリ秒）
     * @returns {void}
     */
    hide(delay = 300) {
        if (!this.overlay) return;
        
        this.clearTimeouts();
        
        this.hideTimeout = setTimeout(() => {
            if (!this.overlay) return;
            
            this.overlay.classList.remove('active');
            
            this.transitionEndHandler = () => {
                if (this.overlay) {
                    if (this.transitionEndHandler) {
                        this.overlay.removeEventListener('transitionend', this.transitionEndHandler);
                        this.transitionEndHandler = null;
                    }
                    if (this.overlay.parentNode) {
                        this.overlay.parentNode.removeChild(this.overlay);
                    }
                    this.cleanup();
                }
            };
            
            this.overlay.addEventListener('transitionend', this.transitionEndHandler);
            
            // transitionend が発火しない場合（アニメーション無効環境など）のフォールバック。
            // hideTimeout とは別変数で管理することで clearTimeouts() が両方を確実にキャンセルできる。
            this.fallbackTimeout = setTimeout(() => {
                if (this.transitionEndHandler) {
                    this.transitionEndHandler();
                }
            }, 400);
        }, delay);
    }

    /**
     * 状態をリセット
     * @returns {void}
     */
    reset() {
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
            this.progressBar.setAttribute('aria-valuenow', '0');
        }

        if (this.percentText) {
            this.percentText.textContent = '0%';
        }

        if (this.statusText) {
            this.statusText.textContent = '準備中';
        }
    }

    /**
     * タイムアウトをクリア（メモリリーク対策）
     * @private
     * @returns {void}
     */
    clearTimeouts() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = null;
        }
    }

    /**
     * リソースをクリーンアップ
     * @returns {void}
     */
    cleanup() {
        // hideTimeout と fallbackTimeout を両方クリア
        this.clearTimeouts();
        
        // transitionend リスナーを削除
        if (this.overlay && this.transitionEndHandler) {
            this.overlay.removeEventListener('transitionend', this.transitionEndHandler);
            this.transitionEndHandler = null;
        }
        
        // すべての DOM 参照をクリア
        this.overlay = null;
        this.progressBar = null;
        this.statusText = null;
        this.percentText = null;
    }

    /**
     * エラー状態を表示
     * @param {string} errorMessage - エラーメッセージ
     * @returns {void}
     */
    showError(errorMessage) {
        if (!this.overlay) return;

        const container = this.overlay.querySelector('.simple-progress-container');
        if (!container) return;

        // エラー表示に切り替え
        container.classList.add('error-state');

        const titleElement = this.overlay.querySelector('.simple-progress-title');
        if (titleElement) {
            titleElement.textContent = 'エラーが発生しました';
        }

        if (this.statusText) {
            this.statusText.textContent = errorMessage;
        }

        // プログレスバーを赤に
        if (this.progressBar) {
            this.progressBar.style.background = 'linear-gradient(90deg, #e74c3c 0%, #c0392b 100%)';
        }

        // 自動で閉じる
        setTimeout(() => {
            this.hide(0);
        }, 3000);
    }
}

export { ProgressIndicator };