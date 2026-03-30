/**
 * FileHandler - ファイル処理モジュール（エラーハンドリング改善版）
 * 依存: config.js, state.js, utils.js, error-handler.js, ui.js, html-processor.js, 
 *       table-processor.js, diff-detector.js, navigation.js
 * 
 * @fileoverview ファイルの検証、読み込み、処理の管理
 */

'use strict';
import { CONFIG } from './config.js';
import { FileValidationError, FileProcessingError, HTMLParsingError, TableProcessingError } from './errors.js';
import { AppState, Logger } from './state.js';
import { Utils, CSSManager } from './utils.js';
import { ErrorHandler } from './error-handler.js';
import { UI } from './ui.js';
import { HTMLProcessor } from './html-processor.js';
import { TableProcessor } from './table-processor.js';
import { DiffBlockDetector, BlockMarkerGenerator } from './diff-detector.js';
import { Navigation } from './navigation.js';
import { ProgressIndicator } from './progress-indicator.js';

const FileHandler = (() => {
    /**
     * ファイルのバリデーション
     * @param {File} file - 検証対象ファイル
     * @returns {boolean} 検証成功時true
     * @throws {FileValidationError} 検証失敗時
     */
    function validate(file) {
        Logger.log('ファイル検証開始:', file?.name);
        
        if (!file) {
            throw new FileValidationError('ファイルが選択されていません。', 'NO_FILE');
        }
        
        if (!file.name || file.name.trim() === '') {
            throw new FileValidationError('無効なファイル名です。', 'INVALID_NAME');
        }
        
        const fileName = file.name.toLowerCase();
        const hasValidExtension = CONFIG.SUPPORTED_EXTENSIONS.some(ext => 
            fileName.endsWith(ext.toLowerCase())
        );
        
        if (!hasValidExtension) {
            throw new FileValidationError(
                `サポートされていないファイル形式です。${CONFIG.SUPPORTED_EXTENSIONS.join(', ')} ファイルを選択してください。`,
                'INVALID_EXTENSION'
            );
        }
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            throw new FileValidationError(
                `ファイルサイズが大きすぎます。最大サイズ: ${Utils.formatFileSize(CONFIG.MAX_FILE_SIZE)}`,
                'FILE_TOO_LARGE'
            );
        }
        
        if (file.size === 0) {
            throw new FileValidationError('ファイルが空です。', 'EMPTY_FILE');
        }
        
        return true;
    }

    /**
     * ファイルを処理
     * @param {File} file - 処理対象ファイル
     * @returns {void}
     */
    function process(file) {
        Logger.log('ファイル処理開始');
        
        if (AppState.isProcessing) {
            Logger.log('既に処理中です');
            return;
        }
        
        try {
            validate(file);
        } catch (error) {
            ErrorHandler.handle(error, 'File validation');
            return;
        }
        
        Logger.log('ファイル検証成功、処理開始');
        AppState.isProcessing = true;
        
        const reader = new FileReader();
        
        reader.onload = async () => {
            Logger.log('ファイル読み込み完了 (UTF-8)');
            try {
                const content = await _rereadAsShiftJisIfNeeded(file, reader.result);
                handleLoad(file, content);
            } catch (e) {
                const error = new FileProcessingError(
                    'ファイルの文字コード変換に失敗しました。',
                    'read',
                    e
                );
                ErrorHandler.handle(error, 'Encoding re-read');
            }
        };
        
        reader.onerror = (event) => {
            const error = new FileProcessingError(
                'ファイル読み込みに失敗しました。',
                'read',
                event.target.error
            );
            ErrorHandler.handle(error, 'File reading');
        };
        
        reader.onabort = () => {
            const error = new FileProcessingError(
                'ファイル読み込みが中断されました。',
                'read'
            );
            ErrorHandler.handle(error, 'File reading aborted');
        };
        
        // Shift-JIS で保存された WinMerge レポートにも対応するため、
        // まず UTF-8 で読み込み、文字化けを検出した場合は Shift-JIS で再読込する。
        // 文字化け判定: UTF-8 デコード結果に replacement character (U+FFFD) が含まれるかで判断する。
        reader.readAsText(file, 'utf-8');
    }

    /**
     * エンコーディングを自動判定してファイルを再読込する
     * UTF-8 デコード結果に U+FFFD が含まれる場合に Shift-JIS で読み直す。
     * @param {File} file - 対象ファイル
     * @param {string} utf8Content - UTF-8 で読み込んだ内容
     * @returns {Promise<string>} 正しいエンコーディングで読み込んだ内容
     */
    function _rereadAsShiftJisIfNeeded(file, utf8Content) {
        // U+FFFD (replacement character) が含まれない場合は UTF-8 で問題なし
        if (!utf8Content.includes('\uFFFD')) {
            return Promise.resolve(utf8Content);
        }
        
        Logger.log('U+FFFD を検出: Shift-JIS で再読込します');
        return new Promise((resolve, reject) => {
            const sjisReader = new FileReader();
            sjisReader.onload = () => resolve(sjisReader.result);
            sjisReader.onerror = (e) => reject(e.target.error);
            sjisReader.readAsText(file, 'shift-jis');
        });
    }

    /**
     * ファイル読み込み後の処理（オーケストレーター）
     * 各ステップをプライベート関数に委譲し、全体の流れだけを管理します。
     * @param {File} file - ファイルオブジェクト
     * @param {string} content - ファイル内容
     * @returns {Promise<void>}
     */
    async function handleLoad(file, content) {
        const progress = new ProgressIndicator();

        try {
            progress.show('WinMergeレポートを処理中');

            await _stepRead(file, content, progress);
            const sanitized = await _stepSanitize(content, progress);
            const doc       = await _stepParse(sanitized, progress);
            const table     = await _stepDetect(doc, progress);
            await _stepMarker(table, progress);
            await _stepRender(progress);

            await Utils.sleep(CONFIG.PROGRESS_COMPLETION_DELAY_MS);
            progress.hide();
            // isProcessing は finally で確実にリセットされるため、ここでは不要
            Logger.log('✅ ファイル処理が正常に完了しました');

        } catch (error) {
            if (progress) {
                const errorMsg = error.message && error.message.length > 50
                    ? error.message.substring(0, 47) + '...'
                    : error.message || 'エラーが発生しました';
                progress.showError(errorMsg);
            }
            ErrorHandler.handle(error, 'File load handling');

        } finally {
            AppState.isProcessing = false;
        }
    }

    // ========================================
    // ステップ関数（プライベート）
    // ========================================

    /**
     * ステップ1: 読み込み準備 (0-20%)
     * 前回データのクリーンアップ・ファイル情報表示・内容検証を行います。
     * @private
     * @param {File} file - ファイルオブジェクト
     * @param {string} content - ファイル内容
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<void>}
     */
    async function _stepRead(file, content, progress) {
        progress.updateStepProgress('read', 0);
        await Utils.sleep(CONFIG.PROGRESS_STEP_DELAY_MS);
        // Navigation.resetInterface() の内部で cleanupTimers / cleanupEventHandlers /
        // AppState.reset() が順に呼ばれるため、ここでの個別呼び出しは不要
        Navigation.resetInterface();
        progress.updateStepProgress('read', 50);
        UI.showFileInfo(file);

        if (!content || content.trim().length === 0) {
            throw new FileProcessingError('ファイルの内容が空です', 'read');
        }
        progress.updateStepProgress('read', 100);
    }

    /**
     * ステップ2: サニタイゼーション (20-40%)
     * XSS等の危険なコードを除去した安全なHTML文字列を返します。
     * @private
     * @param {string} content - 元のファイル内容
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<string>} サニタイズ済みHTML文字列
     */
    async function _stepSanitize(content, progress) {
        progress.updateStepProgress('sanitize', 0);
        await Utils.sleep(CONFIG.PROGRESS_STEP_DELAY_MS);

        let sanitized;
        try {
            sanitized = HTMLProcessor.sanitize(content);
        } catch (error) {
            throw new FileProcessingError('HTMLのサニタイゼーションに失敗しました', 'sanitize', error);
        }
        progress.updateStepProgress('sanitize', 50);

        if (!sanitized || sanitized.trim().length === 0) {
            throw new FileProcessingError('サニタイゼーション後にコンテンツが空になりました', 'sanitize');
        }
        progress.updateStepProgress('sanitize', 100);
        return sanitized;
    }

    /**
     * ステップ3: DOM解析 (40-50%)
     * HTML文字列をDOMに変換し、スタイルをインポートします。
     * @private
     * @param {string} sanitized - サニタイズ済みHTML文字列
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<Document>} 解析済みDocumentオブジェクト
     */
    async function _stepParse(sanitized, progress) {
        progress.updateStepProgress('parse', 0);
        await Utils.sleep(CONFIG.PROGRESS_STEP_DELAY_MS);

        let doc;
        try {
            doc = new DOMParser().parseFromString(sanitized, 'text/html');
            const parserError = doc.querySelector('parsererror');
            if (parserError) {
                throw new HTMLParsingError('HTMLの解析中にエラーが発生しました');
            }
        } catch (error) {
            throw new FileProcessingError('DOM解析に失敗しました', 'parse', error);
        }
        progress.updateStepProgress('parse', 50);

        try {
            HTMLProcessor.importStyles(doc);
        } catch (error) {
            Logger.warn('スタイルインポートに失敗:', error);
        }
        progress.updateStepProgress('parse', 100);
        return doc;
    }

    /**
     * ステップ4: 差分テーブル検出 (50-70%)
     * Documentから差分テーブルを抽出してviewerに追加します。
     * @private
     * @param {Document} doc - 解析済みDocumentオブジェクト
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<HTMLTableElement>} 差分テーブル要素
     */
    async function _stepDetect(doc, progress) {
        progress.updateStepProgress('detect', 0);
        await Utils.sleep(CONFIG.PROGRESS_STEP_DELAY_MS);

        let table;
        try {
            table = HTMLProcessor.processTable(doc);
        } catch (error) {
            // HTMLProcessor.processTable が TableProcessingError を投げる場合は
            // 再ラップせずそのまま再スローする（スタックトレースの二重化を防ぐ）
            if (error instanceof TableProcessingError) throw error;
            throw new TableProcessingError('テーブルの処理に失敗しました', error);
        }
        progress.updateStepProgress('detect', 50);

        if (!table) {
            throw new TableProcessingError('差分テーブルが見つかりませんでした');
        }
        AppState.elements.viewer.appendChild(table);
        progress.updateStepProgress('detect', 100);
        return table;
    }

    /**
     * ステップ5: マーカー生成 (70-90%)
     * 固定ヘッダー・差分マーカーを生成します。
     * デバッグモード時（?debug=true / localhost）はモード切替ボタンも表示します。
     * @private
     * @param {HTMLTableElement} table - 差分テーブル要素
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<void>}
     */
    async function _stepMarker(table, progress) {
        progress.updateStepProgress('marker', 0);
        await Utils.sleep(CONFIG.PROGRESS_MARKER_DELAY_MS);

        try {
            TableProcessor.setupFixedHeader(table);
            progress.updateStepProgress('marker', 20);

            // ブロックモードで差分ブロックを検出・マーカー生成
            AppState.diffBlocks = DiffBlockDetector.detectBlocks(table);
            BlockMarkerGenerator.generateBlockMarkers(AppState.diffBlocks, table);
            BlockMarkerGenerator.updateBlockInfo();
            progress.updateStepProgress('marker', 60);

            TableProcessor.setupIntersectionObserver();
            progress.updateStepProgress('marker', 80);

            // リサイズ時のミニマップマーカー再配置コールバックを登録
            // table-processor.js は diff-detector.js をimportできない（循環依存）ため、
            // このコールバック経由でマーカー位置を再計算する
            AppState.eventHandlers.markerResizeCallback = () => {
                if (!AppState.diffBlocks?.length) return;

                // ブロックハイライト枠を更新
                BlockMarkerGenerator.updateBlockHighlight();

                // ミニマップマーカーを再配置（ペインサイズ・スクロール高さが変わるため）
                const currentTable = AppState.elements.viewer.querySelector('table');
                if (!currentTable) return;

                BlockMarkerGenerator.clearBlockMarkers();
                BlockMarkerGenerator.generateBlockMarkers(AppState.diffBlocks, currentTable);
                Logger.log('✅ リサイズ後のミニマップマーカーを再配置');

            };

            progress.updateStepProgress('marker', 100);
        } catch (error) {
            throw new FileProcessingError('マーカー生成中にエラーが発生しました', 'marker', error);
        }
    }

    /**
     * ステップ6: レンダリング完了処理 (90-100%)
     * ナビゲーションボタンを接続し、ツールヘッダーを非表示にします。
     * @private
     * @param {ProgressIndicator} progress - プログレス表示
     * @returns {Promise<void>}
     */
    async function _stepRender(progress) {
        progress.updateStepProgress('render', 0);
        await Utils.sleep(CONFIG.PROGRESS_STEP_DELAY_MS);

        try {
            AppState.elements.prevDiffButton.onclick = jumpToPrevDiffEnhanced;
            AppState.elements.nextDiffButton.onclick = jumpToNextDiffEnhanced;
            progress.updateStepProgress('render', 50);

            CSSManager.hideElement(AppState.elements.toolHeader, 'toolHeader-visible', 'toolHeader-hidden');
            progress.updateStepProgress('render', 100);
        } catch (error) {
            throw new FileProcessingError('レンダリング中にエラーが発生しました', 'render', error);
        }
    }

    /**
     * 拡張版：次の差分へジャンプ
     * 常にブロックモードで動作する（行表示モードは廃止）。
     * @returns {void}
     */
    function jumpToNextDiffEnhanced() {
        if (!AppState.diffBlocks || AppState.diffBlocks.length === 0) {
            UI.showMessage('ブロックが見つかりません。', 'warning');
            return;
        }
        
        Navigation.clearCurrentDiffHighlight();
        
        const nextIndex = (AppState.currentDiffIndex + 1) % AppState.diffBlocks.length;
        // currentDiffIndex の更新は jumpToBlock 内で一元管理するため、ここでは行わない
        
        const block = AppState.diffBlocks[nextIndex];
        if (!block || !block.rows || block.rows.length === 0) {
            Logger.warn('無効なブロック:', nextIndex);
            return;
        }
        
        BlockMarkerGenerator.jumpToBlock(nextIndex, block);
    }

    /**
     * 拡張版：前の差分へジャンプ
     * 常にブロックモードで動作する（行表示モードは廃止）。
     * @returns {void}
     */
    function jumpToPrevDiffEnhanced() {
        if (!AppState.diffBlocks || AppState.diffBlocks.length === 0) {
            UI.showMessage('ブロックが見つかりません。', 'warning');
            return;
        }
        
        Navigation.clearCurrentDiffHighlight();
        
        const prevIndex = AppState.currentDiffIndex <= 0
            ? AppState.diffBlocks.length - 1
            : AppState.currentDiffIndex - 1;
        // currentDiffIndex の更新は jumpToBlock 内で一元管理するため、ここでは行わない
        
        const block = AppState.diffBlocks[prevIndex];
        if (!block || !block.rows || block.rows.length === 0) {
            Logger.warn('無効なブロック:', prevIndex);
            return;
        }
        
        BlockMarkerGenerator.jumpToBlock(prevIndex, block);
    }


    
    // 公開API
    return {
        validate,
        process,
        handleLoad,
        jumpToNextDiffEnhanced,
        jumpToPrevDiffEnhanced
    };
})();

// ★注意: グローバル汚染を避けるため、直接公開しない
// main.js で WinMergeViewer.FileHandler としてアクセス可能

export { FileHandler };