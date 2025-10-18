# Chrome拡張機能

このディレクトリには、会議休憩管理システムのChrome拡張機能が含まれています。

## 構成

```
extensions/
├── leader/          # **リーダー用拡張機能**
│   ├── manifest.json
│   ├── content.js
│   ├── popup.html
│   └── popup.js
│
└── member/          # メンバー用拡張機能
    ├── manifest.json
    ├── content.js
    ├── popup.html
    └── popup.js
```

---

## Leader拡張機能

### 概要

Google Meet会議中に参加者全員の動画を取得し、疲労度を検知してサーバーに休憩トリガーを送信します。

### 主な機能

- Google Meetページ内の全ビデオストリームを取得
- ポップアップUIで動画のサムネイル表示
- Start/Stopボタンで動画取得を制御
- 疲労度判定（将来実装予定: 瞬き検知）
- REST API経由で休憩トリガーを送信

### ファイル構成

- **manifest.json**: 拡張機能の設定ファイル
  - Manifest V3形式
  - 権限: `activeTab`, `scripting`
  - ホスト: `https://meet.google.com/*`

- **popup.html/popup.js**: ポップアップUI
  - Startボタン: 動画取得開始
  - Stopボタン: 動画取得停止
  - サムネイル表示エリア

- **content.js**: Google Meetページに挿入されるスクリプト
  - ビデオ要素の検出と取得
  - ポップアップとの通信

### 使い方

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/leader` ディレクトリを選択
5. Google Meetページを開く
6. 拡張機能アイコンをクリック
7. 「Start」ボタンをクリックして動画取得を開始

### 開発予定

- 瞬き検知アルゴリズムの実装（MediaPipe等）
- 疲労度判定ロジックの実装
- サーバーへの自動休憩トリガー送信

---

## Member拡張機能

### 概要

サーバーからSSE（Server-Sent Events）で休憩通知を受信し、画面全体にオーバーレイUIを表示します。

### 主な機能

- Meeting IDの手動入力または自動取得
- SSE接続の確立と維持
- 休憩通知の受信
- 全画面オーバーレイUIの表示
- 音声通知（オプション）

### ファイル構成

- **manifest.json**: 拡張機能の設定ファイル
  - Manifest V3形式
  - 権限: `activeTab`, `storage`
  - ホスト: `https://meet.google.com/*`, `http://localhost:8000/*`

- **popup.html/popup.js**: ポップアップUI
  - Meeting ID入力フィールド
  - 更新ボタン（URLから自動取得）
  - 接続状態インジケーター
  - 接続/切断ボタン

- **content.js**: Google Meetページに挿入されるスクリプト
  - SSE接続の管理
  - 休憩通知の受信処理
  - オーバーレイUIの表示/非表示
  - 音声通知の再生

### 使い方

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/member` ディレクトリを選択
5. Google Meetページを開く
6. 拡張機能アイコンをクリック
7. Meeting IDを入力（または更新ボタンでURLから取得）
8. 「接続開始」ボタンをクリック
9. リーダーから休憩通知が来ると、画面全体にオーバーレイが表示される

### SSE接続

- **エンドポイント**: `GET /api/sse/events?meeting_id={id}`
- **イベント**:
  - `connected`: 接続確立
  - `message`: 休憩通知（`event: rest_required`）
  - `heartbeat`: 生存確認（30秒間隔）

### オーバーレイUI

- 半透明の黒背景（全画面）
- グラデーション背景のメッセージボックス
- 「休憩時間です」のメッセージ
- OKボタン
- フェードイン/フェードアウトアニメーション

---

## 共通仕様

### Manifest V3

両方の拡張機能は Chrome Extension Manifest V3 形式を使用しています。

- `manifest_version: 3`
- `content_scripts`: Google Meetページに自動挿入
- `action.default_popup`: ポップアップUI
- `host_permissions`: 必要なホストへのアクセス権限

### Google Meet対象

両方の拡張機能は `https://meet.google.com/*` でのみ動作します。

### ストレージ

Member拡張機能のみ、`chrome.storage.local` を使用して以下を保存:
- `meetingId`: 接続中のMeeting ID
- `isConnected`: 接続状態

---

## 開発ガイド

### デバッグ方法

1. `chrome://extensions/` でデベロッパーモードを有効化
2. 拡張機能の「詳細」をクリック
3. 「バックグラウンドページを検証」または「ポップアップを検証」
4. DevToolsでログを確認

### Content Scriptのデバッグ

1. Google Meetページを開く
2. F12でDevToolsを開く
3. Consoleタブでログを確認
4. `[Leader]` または `[Member]` プレフィックスでフィルタ

### リロード方法

拡張機能のコードを変更した場合:
1. `chrome://extensions/` を開く
2. 更新ボタン（回転矢印）をクリック
3. Google Meetページをリロード（F5）

### よくあるエラー

**"Receiving end does not exist"**
- 原因: Content scriptが読み込まれていない
- 対処: ページをリロード、または拡張機能を再読み込み

**CORS エラー**
- 原因: サーバーのCORS設定が不足
- 対処: サーバーの `main.py` でCORSを有効化

**SSE接続エラー**
- 原因: サーバーが起動していない、またはURLが間違っている
- 対処: `docker-compose up -d` でサーバーを起動、URLを確認

---

## 本番環境での使用

### manifest.jsonの変更

本番環境にデプロイする場合、`member/manifest.json` を変更:

```json
{
  "host_permissions": [
    "https://meet.google.com/*",
    "https://your-production-domain.com/*"
  ]
}
```

### API URLの変更

`member/content.js` の `API_BASE_URL` を変更:

```javascript
const API_BASE_URL = 'https://your-production-domain.com';
```

---

## セキュリティ

### 権限の最小化

必要最小限の権限のみを要求:
- `activeTab`: 現在のタブへのアクセス
- `scripting`: Content scriptの実行（Leader のみ）
- `storage`: ローカルストレージへのアクセス（Member のみ）

### プライバシー

- ビデオデータは拡張機能内でのみ処理され、外部に送信されない
- Meeting IDのみをサーバーに送信
- ユーザーを特定する情報は一切送信しない

---

## 参考リンク

- Chrome Extension Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- Chrome Extension API: https://developer.chrome.com/docs/extensions/reference/
- Server-Sent Events (SSE): https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
