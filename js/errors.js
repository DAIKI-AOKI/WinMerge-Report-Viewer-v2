/**
 * WinMerge Report Viewer - カスタムエラークラス
 * 
 * エラーハンドリングのための専用エラークラス
 * 依存: なし
 * 
 * @fileoverview アプリケーション固有のカスタムエラークラス定義
 */

'use strict';

/**
 * ファイル検証エラー
 * @class FileValidationError
 * @extends {Error}
 */
class FileValidationError extends Error {
    /**
     * FileValidationErrorを作成
     * @param {string} message - エラーメッセージ
     * @param {string} code - エラーコード
     */
    constructor(message, code) {
        super(message);
        /** @type {string} */
        this.name = 'FileValidationError';
        /** @type {string} */
        this.code = code;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

/**
 * ファイル処理エラー
 * @class FileProcessingError
 * @extends {Error}
 */
class FileProcessingError extends Error {
    /**
     * FileProcessingErrorを作成
     * @param {string} message - エラーメッセージ
     * @param {string} phase - 処理フェーズ（'read'|'sanitize'|'parse'|'detect'|'marker'|'render'）
     * @param {Error|null} [originalError=null] - 元のエラーオブジェクト
     */
    constructor(message, phase, originalError = null) {
        super(message);
        /** @type {string} */
        this.name = 'FileProcessingError';
        /** @type {string} */
        this.phase = phase;
        /** @type {Error|null} */
        this.originalError = originalError;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

/**
 * HTML解析エラー
 * @class HTMLParsingError
 * @extends {Error}
 */
class HTMLParsingError extends Error {
    /**
     * HTMLParsingErrorを作成
     * @param {string} message - エラーメッセージ
     * @param {Error|null} [originalError=null] - 元のエラーオブジェクト
     */
    constructor(message, originalError = null) {
        super(message);
        /** @type {string} */
        this.name = 'HTMLParsingError';
        /** @type {Error|null} */
        this.originalError = originalError;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

/**
 * テーブル処理エラー
 * @class TableProcessingError
 * @extends {Error}
 */
class TableProcessingError extends Error {
    /**
     * TableProcessingErrorを作成
     * @param {string} message - エラーメッセージ
     * @param {Error|null} [originalError=null] - 元のエラーオブジェクト
     */
    constructor(message, originalError = null) {
        super(message);
        /** @type {string} */
        this.name = 'TableProcessingError';
        /** @type {Error|null} */
        this.originalError = originalError;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

/**
 * ナビゲーションエラー
 * @class NavigationError
 * @extends {Error}
 */
class NavigationError extends Error {
    /**
     * NavigationErrorを作成
     * @param {string} message - エラーメッセージ
     * @param {number|null} [index=null] - 差分インデックス
     */
    constructor(message, index = null) {
        super(message);
        /** @type {string} */
        this.name = 'NavigationError';
        /** @type {number|null} */
        this.index = index;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

export {
    FileValidationError,
    FileProcessingError,
    HTMLParsingError,
    TableProcessingError,
    NavigationError,
};
