# 会議休憩管理システム ドキュメント

## 概要

Google Meet会議中に参加者の疲労度を検知し、適切なタイミングで全メンバーに休憩を促すリアルタイム通知システムです。

### システムの特徴

- リーダーが参加者全員の状態を監視
- サーバーがリアルタイムで休憩通知を配信
- メンバー全員の画面に強制的にオーバーレイを表示
- Chrome拡張機能で簡単にインストール可能
- 無料でデプロイ可能

### 技術構成

```
┌─────────────────┐
│ Leader拡張機能  │  瞬き検知・疲労判定
│ (Chrome)        │  ↓ POST /api/meetings/{id}/rest
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ FastAPI Server  │  REST API + Socket.IO配信
│ (Python)        │  ↓ Redis Pub/Sub
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Redis           │  状態管理 + イベント配信
│ (In-Memory DB)  │  ↓ WebSocket (Socket.IO)
└─────────────────┘
         │
         ├─────────────────────────────┐
         ▼                             ▼
┌─────────────────┐         ┌─────────────────┐
│ Member拡張機能  │         │ Electron        │
│ (Chrome × N)    │         │ Overlay App     │
│ SSE受信         │         │ デスクトップ    │
│ ブラウザ内      │         │ オーバーレイ    │
│ オーバーレイ表示│         │ 表示            │
└─────────────────┘         └─────────────────┘
                                     ▲
                                     │ Native Messaging
                            ┌─────────────────┐
                            │ Member拡張機能  │
                            │ (設定送信)      │
                            └─────────────────┘
```

---

## ドキュメント構成

### 仕様・設計 (`/spec`)

#### [requirement.md](spec/requirement.md)
要件定義書。システム全体の要件を定義しています。

- システム概要とユーザーストーリー
- 各機能の受入基準
- 技術スタックとスコープ定義
- 実装する機能と実装しない機能
- 成功基準

**読むべき人**: プロジェクトメンバー全員、特に初めて参加する人

#### [design.md](spec/design.md)
設計ドキュメント。システムの技術的な設計を詳細に記述しています。

- アーキテクチャ図とコンポーネント設計
- データ設計（Redis構造）とAPI仕様
- シーケンス図（休憩トリガーの流れ）
- セキュリティ設計
- フォルダ構成

**読むべき人**: 開発者、アーキテクト

#### [tasks.md](spec/tasks.md)
タスク管理。実装タスクの一覧と進捗を管理しています。

- Phase別の実装タスク
- 各タスクのステータス（未着手/進行中/完了）
- 担当者（オプション）

**読むべき人**: 開発リーダー、タスクを確認したい開発者

### インフラ (`/infra`)

#### [deploy.md](infra/deploy.md)
デプロイガイド。本番環境へのデプロイ方法を説明しています。

- Railwayを使った無料デプロイ手順（5分で完了）
- 環境変数設定
- モニタリングとログ確認方法
- トラブルシューティング
- CI/CD自動化（GitHub Actions）

**読むべき人**: インフラ担当、デプロイ担当者

---

## クイックスタート

### 1. 全体像を理解する

```bash
# 1. 要件定義を読む（10分）
doc/spec/requirement.md

# 2. 設計ドキュメントを読む（20分）
doc/spec/design.md
```

### 2. ローカル環境を構築する

```bash
# プロジェクトルートで実行
cd os_2521

# Docker Composeで起動
docker-compose up -d

# ヘルスチェック
curl http://localhost:8000/health
```

### 3. 拡張機能とオーバーレイをインストールする

```bash
# Chrome で chrome://extensions/ を開く
# 「デベロッパーモード」を有効化
# 「パッケージ化されていない拡張機能を読み込む」
# extensions/leader と extensions/member を選択

# Electronオーバーレイをセットアップ（オプション）
npm install
npm run install:native-host
# overlay/com.meeting.rest.overlay.json の拡張機能IDを更新
npm run install:native-host  # 再実行

# Electronオーバーレイを起動
npm run start:overlay
```

詳細は各ディレクトリのREADMEを参照:
- [extensions/README.md](../extensions/README.md)
- [overlay/README.md](../overlay/README.md)
- [overlay/SETUP.md](../overlay/SETUP.md)
- [server/README.md](../server/README.md)

### 4. 動作確認する

```bash
# テストコンソールを開く
open test/index.html

# Meeting IDを入力: test-123
# 「休憩通知を送信」ボタンをクリック
# Member拡張機能で通知が表示されることを確認
```

---

## プロジェクト構成

```
os_2521/
├── doc/                      # このディレクトリ
│   ├── README.md            # このファイル
│   ├── spec/                # 仕様・設計
│   │   ├── requirement.md  # 要件定義
│   │   ├── design.md       # 設計ドキュメント
│   │   └── tasks.md        # タスク管理
│   └── infra/              # インフラ
│       └── deploy.md       # デプロイガイド
│
├── extensions/              # Chrome拡張機能
│   ├── README.md           # 拡張機能の詳細
│   ├── leader/             # リーダー用
│   │   ├── manifest.json
│   │   ├── content.js
│   │   ├── popup.html
│   │   └── popup.js
│   └── member/             # メンバー用
│       ├── manifest.json
│       ├── background.js   # Native Messaging管理
│       ├── content.js
│       ├── popup.html
│       └── popup.js
│
├── overlay/                 # Electronデスクトップオーバーレイ
│   ├── README.md           # オーバーレイの詳細
│   ├── SETUP.md            # セットアップガイド
│   ├── main.js             # Electronメインプロセス
│   ├── preload.js          # プリロードスクリプト
│   ├── renderer.js         # レンダラープロセス
│   ├── overlay.html        # オーバーレイUI
│   └── native-host.js      # Native Messaging Host
│
├── server/                  # FastAPIサーバー
│   ├── README.md           # サーバーの詳細
│   ├── main.py             # メインアプリケーション
│   ├── requirements.txt    # Python依存パッケージ
│   └── Dockerfile          # Dockerイメージ
│
├── scripts/                 # ビルド・セットアップスクリプト
│   ├── build-config.js     # 設定ビルド
│   └── install-native-host.js  # Native Hostインストール
│
├── test/                    # テストコンソール
│   ├── index.html          # 手動テスト用HTML
│   └── README.md           # テスト手順
│
├── docker-compose.yml       # ローカル開発環境
├── package.json            # Node.js依存関係
└── README.md               # プロジェクトのREADME
```

---

## 技術スタック

### フロントエンド
- Chrome Extension Manifest V3
- Vanilla JavaScript
- HTML/CSS
- Electron (デスクトップオーバーレイ)

### バックエンド
- FastAPI (Python 3.11)
- Uvicorn (ASGIサーバー)
- Redis (データストア + Pub/Sub)

### 通信
- REST API
- Server-Sent Events (SSE)
- WebSocket (Socket.IO)
- Chrome Native Messaging

### インフラ
- Docker / Docker Compose
- Railway (無料デプロイ)
- Node.js (Electron & Native Messaging Host)

---

## 開発フロー

### 1. 要件を理解する

[requirement.md](spec/requirement.md) を読んで、システムの目的と要件を理解します。

### 2. 設計を確認する

[design.md](spec/design.md) を読んで、技術的な設計を理解します。

### 3. タスクを確認する

[tasks.md](spec/tasks.md) を読んで、現在の進捗と次にやるべきタスクを確認します。

### 4. ローカル環境で開発する

```bash
# サーバー起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 拡張機能をリロード
# chrome://extensions/ で更新ボタンをクリック
```

### 5. テストする

```bash
# テストコンソールで動作確認
open test/index.html

# APIエンドポイントをテスト
curl http://localhost:8000/docs
```

### 6. デプロイする

[deploy.md](infra/deploy.md) を参照してRailwayにデプロイします。

---

## よくある質問（FAQ）

### Q1. プロジェクトの目的は何ですか？

A: Google Meet会議中に、参加者の疲労を検知して適切なタイミングで休憩を促すシステムです。リーダーが全員の状態を監視し、必要に応じて全員に強制的に休憩を取らせることができます。

### Q2. 誰がこのシステムを使いますか？

A: リモートワーク行う人すべてです。特に長時間の会議が多く、参加者の疲労が問題になっているチームに最適です。

### Q3. どのように動作しますか？

A:
1. リーダーが参加者全員の動画を監視（瞬き検知で疲労度判定）
2. 疲労が蓄積したと判断したら、サーバーに休憩トリガーを送信
3. サーバーがSSEで全メンバーに通知を配信
4. メンバーの画面に休憩オーバーレイが表示される

### Q4. 無料で使えますか？

A: はい。Railwayの無料枠（$5相当/月）を使用すれば完全無料で運用できます。詳細は [deploy.md](infra/deploy.md) を参照してください。

### Q5. Leader拡張機能とMember拡張機能の違いは？

A:
- **Leader拡張機能**: 会議の主催者が使用。参加者の疲労度を監視して休憩トリガーを送信。
- **Member拡張機能**: 参加者全員が使用。サーバーから休憩通知を受信してブラウザ内に表示。

### Q6. Electronオーバーレイとは？

A: デスクトップ全体に表示される休憩通知です。ブラウザの外でも表示されるため、より目立ちます。Chrome拡張機能から接続情報を受け取り、自動的にサーバーに接続します。オプション機能で、Member拡張機能のみでも動作します。

### Q7. プライバシーは守られますか？

A: はい。ビデオデータは拡張機能内でのみ処理され、サーバーに送信されません。Meeting IDのみをサーバーに送信し、個人を特定する情報は一切送信しません。

### Q8. どのブラウザで動作しますか？

A: Google Chrome（およびChromiumベースのブラウザ）で動作します。現在はManifest V3形式です。

### Q9. Redis は必須ですか？

A: はい。Redisは会議の状態管理とリアルタイム通知配信に使用されます。Docker Composeで簡単に起動できます。

### Q10. Native Messagingとは？

A: Chrome拡張機能とネイティブアプリケーション（Electronなど）間で通信するための仕組みです。このシステムでは、Member拡張機能からElectronオーバーレイに接続情報を送信するために使用しています。



## 貢献ガイド

### 新しい機能を追加する場合

1. [requirement.md](spec/requirement.md) に要件を追加
2. [design.md](spec/design.md) に設計を追加
3. [tasks.md](spec/tasks.md) にタスクを追加
4. 実装を開始

### ドキュメントを更新する場合

- 要件が変わった: `spec/requirement.md` を更新
- 設計が変わった: `spec/design.md` を更新
- タスクが完了した: `spec/tasks.md` を更新
- デプロイ手順が変わった: `infra/deploy.md` を更新

---

## 参考リンク

### 公式ドキュメント
- Chrome Extensions: https://developer.chrome.com/docs/extensions/
- FastAPI: https://fastapi.tiangolo.com
- Redis: https://redis.io/documentation
- Railway: https://docs.railway.app

### このプロジェクトのドキュメント
- [要件定義](spec/requirement.md)
- [設計ドキュメント](spec/design.md)
- [タスク管理](spec/tasks.md)
- [デプロイガイド](infra/deploy.md)

### コンポーネント別ドキュメント
- [Chrome拡張機能](../extensions/README.md)
- [Electronオーバーレイ](../overlay/README.md)
- [Electronセットアップガイド](../overlay/SETUP.md)
- [FastAPIサーバー](../server/README.md)

---

## Electronオーバーレイアプリケーション詳細

このElectronアプリケーションは、ブラウザのページ情報をリアルタイムでデスクトップオーバーレイに表示し、休憩通知を全画面で表示します。

### データフロー

#### 新方式（Chrome拡張機能から直接接続）

```
Chrome Extension (member)
    ↓ (Meeting ID & API URL) Chrome Native Messaging
Native Messaging Host (Node.js)
    ↓ TCP (localhost:9876)
Electron Overlay (デスクトップオーバーレイ)
    ↓ (ページ情報を5秒ごとに送信) WebSocket
FastAPI Server (Socket.IO)
```

#### 従来方式（環境変数で設定）

```
Chrome Extension (member)
    ↓ (ページ情報を5秒ごとに送信)
FastAPI Server (Socket.IO)
    ↓ (WebSocketでリアルタイム配信)
Electron Overlay (デスクトップオーバーレイ)
```

### 機能

1. **ページ情報の表示**
   - ブラウザのタイトル、URL、会議IDを右上に表示
   - 5秒ごとに自動更新

2. **休憩通知の表示**
   - 全画面オーバーレイで休憩通知を表示
   - OKボタンで閉じる
   - 通知音を再生

### セットアップ

#### クイックスタート（Chrome拡張機能から接続 - 推奨）

詳細な手順は [overlay/SETUP.md](../overlay/SETUP.md) を参照してください。

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **Chrome拡張機能の読み込み**
   - `chrome://extensions/` で拡張機能を読み込む
   - 拡張機能IDをコピー

3. **Native Messaging Hostのインストール**
   ```bash
   npm run install:native-host
   ```
   - `overlay/com.meeting.rest.overlay.json` の `YOUR_EXTENSION_ID` を実際のIDに置き換え
   - 再度 `npm run install:native-host` を実行

4. **Electronアプリの起動**
   ```bash
   npm run start:overlay
   ```

5. **拡張機能から接続**
   - Google Meetにアクセス
   - 拡張機能から Meeting ID と API URL を送信

#### 従来の方法（環境変数で設定）

環境変数で設定を変更できます：

Windowsの場合：
```cmd
set API_BASE_URL=http://localhost:8000
set MEETING_ID=abc-defg-hij
npm run start:overlay
```

macOS/Linuxの場合：
```bash
export API_BASE_URL=http://localhost:8000
export MEETING_ID=abc-defg-hij
npm run start:overlay
```

### 使い方

#### 基本的な使い方

1. **サーバーを起動**
   ```bash
   cd server
   python main.py
   ```

2. **Chrome拡張機能を読み込む**
   - Chrome拡張機能（extensions/member）をChromeに読み込む
   - Google Meetにアクセス
   - 拡張機能のアイコンをクリックして接続

3. **Electronオーバーレイを起動**
   ```bash
   npm run start:overlay
   ```

4. **動作確認**
   - 右上にページ情報が表示されることを確認
   - リーダーが「休憩」ボタンをクリックすると全画面通知が表示される

#### 会議IDの設定

会議IDは環境変数で設定できます。Google MeetのURLから会議IDを取得して設定してください。

例：`https://meet.google.com/abc-defg-hij` の場合、会議IDは `abc-defg-hij`

```bash
set MEETING_ID=abc-defg-hij
npm run start:overlay
```

### ファイル構成

```
overlay/
├── main.js          # Electronメインプロセス
├── preload.js       # プリロードスクリプト（IPC通信）
├── overlay.html     # オーバーレイUI
├── renderer.js      # レンダラープロセス
└── README.md        # オーバーレイの詳細
```

### トラブルシューティング

#### オーバーレイが表示されない

1. Electronが正しく起動しているか確認
2. コンソールログを確認して接続状態を確認
3. サーバーが起動しているか確認（http://localhost:8000/health）

#### ページ情報が更新されない

1. Chrome拡張機能が正しく接続されているか確認
2. ブラウザのコンソールログを確認
3. サーバーのログを確認（ページ情報受信のログが出力されているか）

#### 休憩通知が表示されない

1. Socket.IO接続が確立されているか確認
2. 会議IDが一致しているか確認
3. Redisが起動しているか確認

### 開発者向け情報

#### デバッグ

main.js の以下の行のコメントを外すと、開発者ツールが開きます：

```javascript
// overlayWindow.webContents.openDevTools({ mode: 'detach' });
```

#### Socket.IOイベント

- `connect`: サーバーに接続
- `disconnect`: サーバーから切断
- `page_info`: ページ情報を受信
- `rest_required`: 休憩通知を受信
- `join_meeting`: 会議ルームに参加

#### カスタマイズ

##### オーバーレイのスタイル変更

`overlay.html` のCSSを編集してスタイルを変更できます。

##### 更新間隔の変更

Chrome拡張機能（extensions/member/content.js）の以下の行を編集：

```javascript
pageInfoInterval = setInterval(sendPageInfo, 5000); // 5000ms = 5秒
```
