/**
 * WinMerge Report Viewer - エラーハンドラー
 * 
 * 統一されたエラーハンドリング
 * 依存: errors.js, state.js, ui.js
 * 
 * @fileoverview エラーの統一処理とユーザーへの通知
 */

'use strict';
import { FileValidationError, FileProcessingError, HTMLParsingError, TableProcessingError, NavigationError } from './errors.js';
import { AppState, Logger } from './state.js';
import { UI } from './ui.js';

/**
 * エラーハンドリングモジュール
 * @namespace ErrorHandler
 */
const ErrorHandler = {
    /**
     * エラーを処理して適切なユーザーメッセージを表示
     * @param {Error} error - エラーオブジェクト
     * @param {string} [context=''] - エラーコンテキスト
     * @returns {void}
     */
    handle(error, context = '') {
        this.logError(error, context);
        
        if (error instanceof FileValidationError) {
            this.handleFileValidationError(error);
        } else if (error instanceof FileProcessingError) {
            this.handleFileProcessingError(error);
        } else if (error instanceof HTMLParsingError) {
            this.handleHTMLParsingError(error);
        } else if (error instanceof TableProcessingError) {
            this.handleTableProcessingError(error);
        } else if (error instanceof NavigationError) {
            this.handleNavigationError(error);
        } else {
            this.handleUnknownError(error);
        }
        
        AppState.isProcessing = false;
    },

    /**
     * ファイル検証エラーを処理
     * @param {FileValidationError} error - ファイル検証エラー
     * @returns {void}
     */
    handleFileValidationError(error) {
        UI.showMessage(error.message, 'warning');
    },

    /**
     * ファイル処理エラーを処理
     * @param {FileProcessingError} error - ファイル処理エラー
     * @returns {void}
     */
    handleFileProcessingError(error) {
        let userMessage = 'ファイル処理中にエラーが発生しました。';
        
        switch (error.phase) {
            case 'read':
                userMessage = 'ファイルの読み込みに失敗しました。ファイルが破損している可能性があります。';
                break;
            case 'sanitize':
                userMessage = 'HTMLファイルの形式に問題があります。WinMergeで生成されたレポートか確認してください。';
                break;
            case 'parse':
                userMessage = 'HTMLの解析に失敗しました。ファイル形式を確認してください。';
                break;
            case 'detect':
                userMessage = '差分の検出に失敗しました。';
                break;
            case 'marker':
                userMessage = 'マーカーの生成に失敗しました。';
                break;
            case 'render':
                userMessage = 'レンダリング中にエラーが発生しました。';
                break;
        }
        
        UI.showMessage(userMessage + ' 詳細はブラウザのコンソールを確認してください。');
    },

    /**
     * HTML解析エラーを処理
     * @param {HTMLParsingError} error - HTML解析エラー
     * @returns {void}
     */
    handleHTMLParsingError(error) {
        UI.showMessage(
            'HTMLの解析に失敗しました。WinMerge HTMLレポートファイルであることを確認してください。',
            'error'
        );
    },

    /**
     * テーブル処理エラーを処理
     * @param {TableProcessingError} error - テーブル処理エラー
     * @returns {void}
     */
    handleTableProcessingError(error) {
        UI.showMessage(
            '差分テーブルの処理に失敗しました。WinMerge HTMLレポートファイルであることを確認してください。',
            'error'
        );
    },

    /**
     * ナビゲーションエラーを処理
     * @param {NavigationError} error - ナビゲーションエラー
     * @returns {void}
     */
    handleNavigationError(error) {
        Logger.warn('Navigation error:', error.message);
        UI.showMessage(error.message, 'warning');
    },

    /**
     * 未知のエラーを処理
     * @param {Error} error - エラーオブジェクト
     * @returns {void}
     */
    handleUnknownError(error) {
        Logger.error('Unknown error:', error);
        UI.showMessage(
            '予期しないエラーが発生しました。ページをリロードして再試行してください。',
            'error'
        );
    },

    /**
     * エラーをログに記録
     * @param {Error} error - エラーオブジェクト
     * @param {string} context - エラーコンテキスト
     * @returns {void}
     */
    logError(error, context) {
        const errorInfo = {
            name: error.name || 'Error',
            message: error.message,
            context: context,
            timestamp: error.timestamp || new Date().toISOString(),
            stack: error.stack
        };

        if (error.code) errorInfo.code = error.code;
        if (error.phase) errorInfo.phase = error.phase;
        if (error.index !== undefined) errorInfo.index = error.index;
        if (error.originalError) {
            errorInfo.originalError = {
                message: error.originalError.message,
                stack: error.originalError.stack
            };
        }

        Logger.error('Error occurred:', errorInfo);
    }
};

export { ErrorHandler };