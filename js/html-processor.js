/**
 * WinMerge Report Viewer - HTML処理
 * 
 * HTMLのサニタイゼーションとスタイル処理
 * 依存: config.js, state.js, errors.js, table-processor.js
 * 
 * @fileoverview HTMLの安全な処理とスタイルインポート
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { TableProcessingError } from './errors.js';
import { TableProcessor } from './table-processor.js';

/**
 * HTML処理モジュール
 * @namespace HTMLProcessor
 */
const HTMLProcessor = {
    /**
     * HTMLをサニタイズ
     * @param {string} html - サニタイズするHTML文字列
     * @returns {string} サニタイズされたHTML
     */
    sanitize(html) {
        Logger.log('HTML sanitization started');
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // tagName は HTML 仕様により大文字で返るため toLowerCase() で正規化して比較する。
            // （'html' との直接比較では常に true になりフォールバックに落ちてしまう）
            if (!doc.documentElement || doc.documentElement.tagName.toLowerCase() !== 'html') {
                Logger.warn('HTML parse error detected, falling back to strict sanitize.');
                return this.strictBasicSanitize(html);
            }

            const allElements = Array.from(doc.querySelectorAll('*'));
            allElements.forEach(el => {
                if (!el || !el.tagName || !el.parentNode) return;

                // 許可されていないタグを削除（styleタグは許可）
                if (!CONFIG.ALLOWED_TAGS.includes(el.tagName.toLowerCase())) {
                    try {
                        const parent = el.parentNode;
                        const children = Array.from(el.childNodes);

                        if (parent.nodeType === Node.ELEMENT_NODE || parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                            children.forEach(child => {
                                try {
                                    if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.ELEMENT_NODE) {
                                        parent.insertBefore(child, el);
                                    }
                                } catch (e) {
                                    Logger.warn('Child insertion skipped');
                                }
                            });
                        }

                        try {
                            parent.removeChild(el);
                        } catch (e) {
                            Logger.warn('Element removal failed');
                        }
                    } catch (error) {
                        Logger.warn('Element removal skipped');
                    }
                }
            });

            // 危険な属性を削除（onclickなど）
            doc.querySelectorAll('*').forEach(el => {
                if (el && el.attributes) {
                    Array.from(el.attributes).forEach(attr => {
                        if (attr && attr.name) {
                            if (attr.name.startsWith('on') || (attr.value && attr.value.toLowerCase().includes('javascript:'))) {
                                el.removeAttribute(attr.name);
                            }
                        }
                    });
                }
            });

            Logger.log('HTML sanitization completed successfully');
            return doc.body ? doc.body.innerHTML : this.strictBasicSanitize(html);
        } catch (error) {
            Logger.error('Sanitize error:', error);
            return this.strictBasicSanitize(html);
        }
    },

    /**
     * 厳格なサニタイズ（最終フォールバック）
     * @param {string} html - サニタイズするHTML文字列
     * @returns {string} サニタイズされたHTML
     */
    strictBasicSanitize(html) {
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
            .replace(/<object[\s\S]*?<\/object>/gi, '')
            .replace(/<embed[\s\S]*?<\/embed>/gi, '')
            .replace(/<form[\s\S]*?<\/form>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/javascript\s*:/gi, '')
            .replace(/vbscript\s*:/gi, '')
            .replace(/data\s*:\s*text\/html/gi, '');
    },

    /**
     * スタイルをインポート
     * @param {Document} doc - DOMドキュメント
     * @returns {void}
     */
    importStyles(doc) {
        const styleNodes = doc.querySelectorAll('style');
        if (!styleNodes.length) return;
        
        AppState.importedStyleElem = document.createElement('style');
        AppState.importedStyleElem.setAttribute('data-imported', 'true');
        let css = '';
        styleNodes.forEach(s => {
            let styleContent = s.textContent || '';
            // 念のため危険なCSS構文を除去
            styleContent = styleContent
                .replace(/expression\s*\(/gi, '')
                .replace(/javascript\s*:/gi, '')
                .replace(/vbscript\s*:/gi, '')
                .replace(/@import/gi, '')
                .replace(/behavior\s*:/gi, '')
                .replace(/binding\s*:/gi, '');
            css += styleContent + '\n';
        });
        AppState.importedStyleElem.textContent = css;
        document.head.appendChild(AppState.importedStyleElem);
    },

    /**
     * テーブルを処理
     * @param {Document} doc - DOMドキュメント
     * @returns {HTMLTableElement} 処理されたテーブル
     * @throws {TableProcessingError} テーブルが見つからない場合
     */
    processTable(doc) {
        const diffTable = doc.querySelector('table.diff') || doc.querySelector('table');
        if (!diffTable) {
            throw new TableProcessingError(
                '差分テーブルが見つかりません。WinMerge HTMLレポートファイルであることを確認してください。'
            );
        }
        const table = diffTable.cloneNode(true);
        TableProcessor.addRightBars(table);
        return table;
    },

    /**
     * インポートしたスタイルを削除
     * @returns {void}
     */
    removeImportedStyle() {
        if (AppState.importedStyleElem && AppState.importedStyleElem.parentNode) {
            AppState.importedStyleElem.parentNode.removeChild(AppState.importedStyleElem);
            AppState.importedStyleElem = null;
        }
    }
};

export { HTMLProcessor };