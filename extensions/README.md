# Chrome拡張機能

このディレクトリには、会議休憩管理システムのChrome拡張機能が含まれています。

## 構成

```
extensions/
├── leader/          # **リーダー用拡張機能**
│   ├── manifest.json
│   ├── config.js    # 自動生成（.gitignore対象）
│   ├── content.js
│   ├── popup.html
│   └── popup.js
│
└── member/          # メンバー用拡張機能
    ├── manifest.json
    ├── config.js    # 自動生成（.gitignore対象）
    ├── content.js
    ├── popup.html
    └── popup.js
```

**注意**: `config.js` は `node scripts/build-config.js` で自動生成されます。

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

- **config.js**: API URL設定（自動生成、.gitignore対象）
  - `DEFAULT_API_URL`: Railway本番環境のURL
  - `LOCAL_API_URL`: ローカル開発環境のURL

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

### 開発内容

- 瞬き検知アルゴリズムの実装
- 疲労度判定ロジックの実装
- 会議者の画像データをサーバーへ送信

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

- **config.js**: API URL設定（自動生成、.gitignore対象）
  - `DEFAULT_API_URL`: Railway本番環境のURL
  - `FALLBACK_API_URL`: ローカル開発環境のURL

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
