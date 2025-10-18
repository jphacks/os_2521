# 会議休憩管理システム (Meeting Rest System)

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2025/05/JPHACKS2025_ogp.jpg)](https://www.youtube.com/watch?v=lA9EluZugD8)

## 製品概要

Google Meet会議中に参加者の疲労度を検知し、適切なタイミングで全メンバーに休憩を促すリアルタイムシステムです。

### 背景(製品開発のきっかけ、課題等）

長時間のオンライン会議では、参加者が疲労していても休憩を取りづらい状況があります。特に、個人の判断で休憩を取ることが難しく、会議の生産性が低下してしまう問題があります。

### 製品説明（具体的な製品の説明）

このシステムは、Google Meet会議中にリーダーが参加者の疲労度を検知し、全メンバーに対して一斉に休憩通知を送ることができます。通知を受けたメンバーには、自動的に休憩オーバーレイUIが表示され、強制的に休憩を促します。

### 特長

#### 1. リアルタイム疲労度検知
リーダー拡張機能が参加者の瞬き数を検知し、疲労度を自動判定します。

#### 2. 全員同時休憩
Server-Sent Events (SSE)を使用して、全メンバーに対して同時に休憩通知を配信します。

#### 3. 強制力のある休憩UI
美しいオーバーレイUIで画面全体を覆い、確実に休憩を取らせます。

### 解決出来ること

- 会議中の疲労の蓄積を防止
- 適切なタイミングでの休憩促進
- 会議の生産性向上

### 今後の展望

- 高精度な瞬き検知（MediaPipe Face Meshの統合）
- 個人別疲労度ダッシュボード
- Slack/Discord通知連携
- 会議品質レポート機能

### 注力したこと（こだわり等）

- シンプルで使いやすいUI/UX
- リアルタイム通信の安定性
- Chrome拡張機能とサーバーのスムーズな連携

## セットアップ手順

### 前提条件

- Docker & Docker Compose
- Google Chrome ブラウザ
- Node.js（開発時のみ）

### 1. サーバーの起動

```bash
# リポジトリをクローン
git clone <repository-url>
cd os_2521

# Docker Composeでサーバーを起動
docker-compose up -d

# ログを確認
docker-compose logs -f
```

サーバーは `http://localhost:8000` で起動します。

### 2. Chrome拡張機能のインストール

#### Leader拡張機能（リーダー用）

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/leader` フォルダを選択

#### Member拡張機能（メンバー用）

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/member` フォルダを選択

### 3. Electronオーバーレイアプリケーション（NEW!）

デスクトップオーバーレイでブラウザのページ情報をリアルタイム表示します。

```bash
# 依存関係をインストール
npm install

# 環境変数を設定（オプション）
set MEETING_ID=abc-defg-hij
set API_BASE_URL=http://localhost:8000

# Electronオーバーレイを起動
npm run start:overlay
```

詳細は [overlay/README.md](overlay/README.md) を参照してください。

### 4. 使い方

#### リーダー側

1. Google Meetに参加
2. 拡張機能アイコンをクリックし、ポップアップを開く
3. 「Start」ボタンをクリックして計測開始
4. 疲労度が検知されると自動で休憩通知が送信される
5. または手動で「休憩」ボタンをクリックして通知
6. 会議終了時は「計測終了」ボタンをクリック

#### メンバー側（ブラウザ内）

1. Google Meetに参加
2. 拡張機能アイコンをクリックして接続
3. 拡張機能が自動的にSSE接続を確立
4. リーダーから休憩通知が送られると、ブラウザ内にオーバーレイUIが表示される
5. 「OK」ボタンをクリックして休憩を開始

#### メンバー側（Electronオーバーレイ）

1. Google Meetに参加
2. Chrome拡張機能で接続
3. Electronオーバーレイを起動（`npm run start:overlay`）
4. デスクトップ右上にページ情報がリアルタイム表示される
5. リーダーから休憩通知が送られると、デスクトップ全画面にオーバーレイが表示される
6. 「OK」ボタンをクリックして休憩を開始

## システム構成

```
meeting-rest-system/
├── docker-compose.yml          # Docker設定
├── package.json                # Node.js依存関係
├── server/                     # FastAPIサーバー
│   ├── main.py                # API実装（Socket.IO対応）
│   ├── requirements.txt       # Python依存関係
│   └── Dockerfile             # Dockerイメージ
├── overlay/                    # Electronオーバーレイ（NEW!）
│   ├── main.js                # Electronメインプロセス
│   ├── preload.js             # プリロードスクリプト
│   ├── overlay.html           # オーバーレイUI
│   ├── renderer.js            # レンダラープロセス
│   └── README.md              # セットアップ手順
├── extensions/
│   ├── leader/                # リーダー用拡張機能
│   │   ├── manifest.json
│   │   ├── content.js
│   │   ├── popup.html
│   │   └── popup.js
│   └── member/                # メンバー用拡張機能
│       ├── manifest.json
│       ├── content.js         # ページ情報送信機能追加
│       └── popup.js
└── doc/                       # ドキュメント
    ├── requirement.md         # 要件定義
    ├── design.md              # 設計書
    └── tasks.md               # タスクリスト
```

## データフロー

### ブラウザ内オーバーレイ（既存）
```
Chrome Extension (leader)
    ↓ (POST /api/meetings/{id}/rest)
FastAPI Server
    ↓ (Redis Pub/Sub)
FastAPI Server (SSE)
    ↓ (Server-Sent Events)
Chrome Extension (member)
    ↓ (ブラウザ内オーバーレイ表示)
```

### デスクトップオーバーレイ（NEW!）
```
Chrome Extension (member)
    ↓ (POST /api/meetings/{id}/page-info - 5秒ごと)
FastAPI Server
    ↓ (Socket.IO WebSocket)
Electron Overlay
    ↓ (デスクトップオーバーレイ表示)
```

## 開発技術

### 活用した技術

#### API・データ

- Server-Sent Events (SSE) - リアルタイム通信
- Socket.IO - WebSocketベースのリアルタイム通信（NEW!）
- Redis Pub/Sub - イベント配信

#### フレームワーク・ライブラリ・モジュール

- FastAPI - Pythonバックエンド
- Redis - インメモリデータベース
- sse-starlette - SSE実装
- python-socketio - Socket.IOサーバー実装（NEW!）
- Electron - デスクトップオーバーレイアプリケーション（NEW!）
- Chrome Extension Manifest V3

#### デバイス

- Webカメラ（瞬き検知用）

### 独自技術

#### ハッカソンで開発した独自機能・技術

- Chrome拡張機能とFastAPIサーバーのシームレスな連携
- SSEを使用したリアルタイム休憩通知システム
- 美しいオーバーレイUIによる強制休憩機能

## API エンドポイント

### HTTP REST API

- `GET /health` - ヘルスチェック
- `POST /api/meetings/{meeting_id}/start` - 計測開始
- `DELETE /api/meetings/{meeting_id}/end` - 計測終了
- `POST /api/meetings/{meeting_id}/rest` - 休憩トリガー
- `POST /api/meetings/{meeting_id}/page-info` - ページ情報受信（NEW!）
- `GET /api/meetings/{meeting_id}/status` - 状態確認
- `GET /api/sse/events?meeting_id={id}` - SSEストリーム接続

### Socket.IO イベント（NEW!）

- `connect` - Socket.IO接続確立
- `disconnect` - Socket.IO切断
- `join_meeting` - 会議ルームに参加
- `leave_meeting` - 会議ルームから退出
- `page_info` - ページ情報配信（サーバー→クライアント）
- `rest_required` - 休憩通知配信（サーバー→クライアント）

## トラブルシューティング

### サーバーが起動しない

```bash
# ログを確認
docker-compose logs api redis

# コンテナを再起動
docker-compose restart
```

### SSE接続が確立されない

- サーバーが起動しているか確認（`http://localhost:8000/health`）
- ブラウザのコンソールでエラーを確認
- CORS設定を確認

## ライセンス

MIT License
