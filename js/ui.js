/**
 * WinMerge Report Viewer - UI制御 (改善版 v6.1)
 * 
 * ユーザーインターフェースの表示制御
 * 依存: config.js, state.js, utils.js
 * 
 * @fileoverview UI要素の表示・非表示とメッセージ管理
 */

'use strict';
import { CONFIG } from './config.js';
import { AppState, Logger } from './state.js';
import { Utils, CSSManager } from './utils.js';

/**
 * UI制御モジュール
 * @namespace UI
 */
const UI = {
    /**
     * メッセージを表示
     * @param {string} message - 表示するメッセージ
     * @param {'error'|'warning'} [type='error'] - メッセージタイプ
     * @returns {void}
     */
    showMessage(message, type = 'error') {
        const className = type === 'warning' ? 'warning-message' : 'error-message';
        const messageDiv = document.createElement('div');
        messageDiv.className = className;
        messageDiv.setAttribute('role', 'alert');
        messageDiv.textContent = message;
        AppState.elements.viewer.innerHTML = '';
        AppState.elements.viewer.appendChild(messageDiv);
    },

    /**
     * ローディング表示
     * @returns {void}
     */
    showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.textContent = 'ファイルを処理中';
        AppState.elements.viewer.innerHTML = '';
        AppState.elements.viewer.appendChild(loadingDiv);
    },

    /**
     * ファイル情報を表示
     * @param {File} file - ファイルオブジェクト
     * @returns {void}
     */
    showFileInfo(file) {
        AppState.elements.dropArea.style.display = 'none';
        
        // ★改善: UI_CONSTANTS.CONTROL_BUTTONS → CONFIG.CONTROL_BUTTONS
        CONFIG.CONTROL_BUTTONS.forEach(id => {
            CSSManager.showElement(AppState.elements[id]);
        });
        
        const fileInfoDiv = document.createElement('div');
        fileInfoDiv.className = 'file-info';
        
        const filename = document.createElement('strong');
        filename.textContent = 'ファイル名: ';
        const filenameValue = document.createElement('span');
        filenameValue.textContent = Utils.truncateFilename(file.name);
        
        const filesize = document.createElement('strong');
        filesize.textContent = 'サイズ: ';
        const filesizeValue = document.createElement('span');
        filesizeValue.textContent = Utils.formatFileSize(file.size);
        
        const lastModified = document.createElement('strong');
        lastModified.textContent = '最終更新: ';
        const lastModifiedValue = document.createElement('span');
        lastModifiedValue.textContent = new Date(file.lastModified).toLocaleString('ja-JP');
        
        fileInfoDiv.appendChild(filename);
        fileInfoDiv.appendChild(filenameValue);
        fileInfoDiv.appendChild(document.createElement('br'));
        fileInfoDiv.appendChild(filesize);
        fileInfoDiv.appendChild(filesizeValue);
        fileInfoDiv.appendChild(document.createElement('br'));
        fileInfoDiv.appendChild(lastModified);
        fileInfoDiv.appendChild(lastModifiedValue);
        
        AppState.elements.viewer.innerHTML = '';
        AppState.elements.viewer.appendChild(fileInfoDiv);
    },

    /**
     * ビューワーをクリア
     * @returns {void}
     */
    clearViewer() {
        if (!AppState.elements.viewer) return;
        try {
            AppState.elements.viewer.innerHTML = '';
            Logger.log('Viewer cleared safely');
        } catch (error) {
            Logger.error('Clear viewer error:', error);
        }
    }
};

export { UI };