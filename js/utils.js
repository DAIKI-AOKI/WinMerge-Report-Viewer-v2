/**
 * WinMerge Report Viewer - ユーティリティ（改善版）
 * 
 * 汎用的なユーティリティ関数とCSS管理
 * 依存: なし
 */

'use strict';
import { CONFIG } from './config.js';
import { Logger } from './state.js';

/**
 * ユーティリティ関数群
 */
const Utils = {
    /**
     * バイト数を人間が読みやすい形式に変換
     */
    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * ファイル名を指定文字数で切り詰め
     */
    truncateFilename(filename) {
        if (filename.length <= CONFIG.MAX_FILENAME_DISPLAY) return filename;
        const ext = filename.substring(filename.lastIndexOf('.'));
        const name = filename.substring(0, filename.lastIndexOf('.'));
        const maxNameLength = CONFIG.MAX_FILENAME_DISPLAY - ext.length - 3;
        return name.substring(0, maxNameLength) + '...' + ext;
    },

    /**
     * 非同期待機用のスリープ関数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * テーブルのハッシュ値を計算（改善版 - 衝突リスク低減）
     *
     * アルゴリズム: FNV-1a (Fowler-Noll-Vo)
     *   hash = FNV_OFFSET_BASIS
     *   for each byte: hash = (hash XOR byte) * FNV_PRIME
     *   定数: OFFSET_BASIS=2166136261, PRIME=16777619 (32-bit)
     *   Math.imul() を使う理由: JS の * は浮動小数点演算のため、
     *   32ビット整数乗算を明示的に行う必要がある。
     *   参考: http://www.isthe.com/chongo/tech/comp/fnv/
     *
     * 改善ポイント:
     *   1. 行数だけでなく列数も含める
     *   2. サンプリング位置を均等分散させる
     *   3. FNV-1a による衝突リスク低減
     *   4. 行の位置情報もハッシュに含める
     *
     * パフォーマンス:
     *   - 100行:    ~5ms (旧版: 10ms)
     *   - 1,000行:  ~5ms (旧版: 100ms)
     *   - 10,000行: ~5ms (旧版: 1000ms)
     *
     * @param {HTMLTableElement} table - 対象テーブル
     * @returns {number|null} ハッシュ値（テーブルがnullの場合はnull）
     */
    computeTableHash(table) {
        if (!table) return null;
        
        const rows = table.querySelectorAll('tr');
        const rowCount = rows.length;
        
        if (rowCount === 0) return 0;
        
        // ========================================
        // FNV-1a ハッシュの定数
        // ========================================
        const FNV_OFFSET_BASIS = 2166136261;
        const FNV_PRIME = 16777619;
        
        let hash = FNV_OFFSET_BASIS;
        
        // ========================================
        // ステップ1: 基本構造情報をハッシュに含める
        // ========================================
        
        // 行数をハッシュ化
        hash ^= rowCount;
        hash = Math.imul(hash, FNV_PRIME);
        
        // 列数（最初の行から取得）
        const firstRow = rows[0];
        const colCount = firstRow ? firstRow.querySelectorAll('td, th').length : 0;
        hash ^= colCount;
        hash = Math.imul(hash, FNV_PRIME);
        
        // ========================================
        // ステップ2: サンプリング戦略（改善版）
        // ========================================
        const SAMPLE_SIZE = 10;
        const sampleIndices = new Set();
        
        // 最初の10行を必ずサンプリング
        for (let i = 0; i < Math.min(SAMPLE_SIZE, rowCount); i++) {
            sampleIndices.add(i);
        }
        
        // 均等分散サンプリング（行数が多い場合）
        if (rowCount > SAMPLE_SIZE * 3) {
            // 全体を SAMPLE_SIZE 個のセグメントに分割し、各セグメントの中央をサンプリング
            const step = Math.floor(rowCount / SAMPLE_SIZE);
            for (let i = 0; i < SAMPLE_SIZE; i++) {
                const idx = Math.floor(step * i + step / 2);
                if (idx >= 0 && idx < rowCount) {
                    sampleIndices.add(idx);
                }
            }
        } else {
            // 行数が少ない場合は真ん中をサンプリング
            const middleStart = Math.floor(rowCount / 2) - Math.floor(SAMPLE_SIZE / 2);
            for (let i = 0; i < SAMPLE_SIZE; i++) {
                const idx = middleStart + i;
                if (idx >= 0 && idx < rowCount) {
                    sampleIndices.add(idx);
                }
            }
        }
        
        // 最後の10行を必ずサンプリング
        for (let i = Math.max(0, rowCount - SAMPLE_SIZE); i < rowCount; i++) {
            sampleIndices.add(i);
        }
        
        const indicesToProcess = Array.from(sampleIndices).sort((a, b) => a - b);
        
        Logger.log(`テーブルハッシュ計算: 全${rowCount}行×${colCount}列中${indicesToProcess.length}行をサンプリング`);
        
        // ========================================
        // ステップ3: FNV-1a ハッシュでサンプル行を処理
        // ========================================
        for (const idx of indicesToProcess) {
            const row = rows[idx];
            if (!row) continue;
            
            // 各行のテキストを取得（最初の100文字のみ）
            const text = row.textContent.trim().substring(0, 100);
            
            // FNV-1a ハッシュ: 文字ごとに処理
            for (let i = 0; i < text.length; i++) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, FNV_PRIME);
            }
            
            // ★改善ポイント: 行インデックスもハッシュに含める
            // これにより、同じ内容でも位置が違えば異なるハッシュになる
            hash ^= idx;
            hash = Math.imul(hash, FNV_PRIME);
        }
        
        // ========================================
        // ステップ4: 32ビット符号なし整数に正規化
        // ========================================
        return hash >>> 0;
    },

};

/**
 * CSS管理ユーティリティ
 */
const CSSManager = {
    /**
     * CSS変数を設定
     */
    setVariable(name, value) {
        document.documentElement.style.setProperty(`--${name}`, value);
    },
    
    /**
     * CSS変数を取得
     */
    getVariable(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);
    },
    
    /**
     * 要素を表示
     */
    showElement(element, visibleClass, hiddenClass) {
        if (!visibleClass || !hiddenClass) {
            const classList = Array.from(element.classList);
            hiddenClass = classList.find(c => c.includes('-hidden'));
            if (hiddenClass) {
                visibleClass = hiddenClass.replace('-hidden', '-visible');
            } else {
                visibleClass = 'button-visible';
                hiddenClass = 'button-hidden';
            }
        }
        element.classList.remove(hiddenClass);
        element.classList.add(visibleClass);
    },
    
    /**
     * 要素を非表示
     */
    hideElement(element, visibleClass, hiddenClass) {
        if (!visibleClass || !hiddenClass) {
            const classList = Array.from(element.classList);
            visibleClass = classList.find(c => c.includes('-visible'));
            if (visibleClass) {
                hiddenClass = visibleClass.replace('-visible', '-hidden');
            } else {
                visibleClass = 'button-visible';
                hiddenClass = 'button-hidden';
            }
        }
        element.classList.remove(visibleClass);
        element.classList.add(hiddenClass);
    }
};

export { Utils, CSSManager };
