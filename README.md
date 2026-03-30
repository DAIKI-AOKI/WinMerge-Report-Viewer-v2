# WinMerge Report Viewer v2

WinMerge が出力した HTML 差分レポートを、より快適にレビューするためのビューアです。

## 主な機能

- ドラッグ&ドロップでの HTM/HTML ファイル読み込み
- 差分ブロックのミニマップ（左右2ペイン・旧/新ファイル別色表示）
- 差分ブロックへのキーボード/ボタンナビゲーション
- 固定ヘッダー（スクロール時にカラム名を常時表示）
- Shift-JIS / UTF-8 自動判別
- ファイル処理中のプログレスインジケーター

## 使い方

1. `index.html` をブラウザで開く（`file://` または任意の HTTP サーバー）
2. WinMerge で生成した `.htm` / `.html` レポートをドラッグ&ドロップ、またはボタンで選択

> **制約**: 最大ファイルサイズ 10 MB。スマートフォン非対応。

## ファイル構成

```
├── index.html
├── style.css
├── js/
│   ├── main.js              # エントリーポイント・初期化
│   ├── config.js            # 設定定数
│   ├── state.js             # アプリケーション状態管理
│   ├── errors.js            # カスタムエラークラス
│   ├── error-handler.js     # エラーハンドリング
│   ├── event-manager.js     # イベントリスナー管理
│   ├── file-handler.js      # ファイル読み込み・処理オーケストレーター
│   ├── html-processor.js    # HTML サニタイズ・スタイルインポート
│   ├── table-processor.js   # 差分テーブル処理・固定ヘッダー
│   ├── diff-detector.js     # 差分ブロック検出・ミニマップマーカー生成
│   ├── navigation.js        # 差分ナビゲーション・リセット
│   ├── progress-indicator.js# プログレス表示
│   ├── ui.js                # UI 表示制御
│   └── utils.js             # 汎用ユーティリティ
└── _legacy/
    └── marker-manager.js    # 旧・行単位マーカー（使用停止・参照禁止）
```

## 前バージョン（v1）との主な差分

| 項目 | 内容 |
|---|---|
| バグ修正 | `TableProcessingError` の二重ラップを解消 |
| バグ修正 | `currentDiffIndex` の二重代入を解消（`jumpToBlock` に一元化） |
| 設計改善 | `_Navigation` / `setNavigation` を `BlockMarkerGenerator` スコープ内に移動 |
| 設計改善 | 使用停止済みの `WeakMap`（`markerEventListeners`）を全モジュールから削除 |
| 設計改善 | `isNeutral()` の重複条件を削除・閾値の根拠をコメントに明記 |
| 整理 | `computeTableHash` の FNV-1a 説明を JSDoc に統合 |
| 整理 | `config.js` のコメントアウトコード（`loadUserColorConfig` 等）を削除 |
| 整理 | `main.js` の不要な `typeof` ガードを削除 |
| 整理 | `progress-indicator.js` の `hideTimeout` / `fallbackTimeout` を分離 |
| 隔離 | `marker-manager.js` を `_legacy/` に移動 |

## 開発・デバッグ

URL に `?debug=true` を付けるか、`localhost` / `127.0.0.1` で開くとデバッグモードが有効になります。

```
# ブラウザコンソールで使用可能なデバッグ関数
wmv.debug.showBlocks()      # 差分ブロック統計・一覧
wmv.debug.visualizeBlocks() # ブロックを色枠で視覚化
wmv.debug.memoryStatus()    # メモリ使用量
wmv.debug.appState()        # AppState の状態
wmv.debug.all()             # 上記すべて
```

## ライセンス

MIT
