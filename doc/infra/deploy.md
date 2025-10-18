# FastAPI + Redis + Socket.IO デプロイガイド（Railway無料版）

このドキュメントでは、会議休憩管理システムのFastAPIサーバー、Socket.IO、Redisを**Railway**を使って無料でデプロイする方法を説明します。

**システム構成**:
- FastAPI（REST API + SSE + Socket.IO）
- Redis（状態管理 + Pub/Sub）
- Socket.IO（まばたき検知の双方向通信）
- Polling transport（WebSocketは無効化）

## 目次

1. [ローカル開発環境](#ローカル開発環境)
2. [Railwayへのデプロイ](#railwayへのデプロイ)
3. [環境変数の設定](#環境変数の設定)
4. [モニタリングとログ](#モニタリングとログ)
5. [トラブルシューティング](#トラブルシューティング)

---

## ローカル開発環境

### 前提条件

- Docker Desktop がインストールされている
- Git でリポジトリをクローン済み

### 起動手順

```bash
# リポジトリのルートディレクトリに移動
cd os_2521

# Docker Composeで起動
docker-compose up -d

# ログを確認
docker-compose logs -f

# 停止
docker-compose down

# 完全にクリーンアップ（ボリュームも削除）
docker-compose down -v
```

### エンドポイント確認

```bash
# ヘルスチェック
curl http://localhost:8000/health
# 期待される出力:
# {"status":"healthy","redis":"connected","redis_config":{"host":"redis","port":6379}}

# ルートエンドポイント
curl http://localhost:8000/
# 期待される出力:
# {"service":"Meeting Rest System API","status":"running","version":"1.0.0",...}

# APIドキュメント（Swagger UI）
open http://localhost:8000/docs

# Redisの状態確認
docker-compose exec redis redis-cli ping
# 期待される出力: PONG

# Socket.IO接続テスト
curl http://localhost:8000/socket.io/?EIO=4&transport=polling
# 期待される出力: {"sid":"...","upgrades":[],"pingInterval":...}
```

---

## Railwayへのデプロイ

### Railwayの特徴

- 無料枠: $5相当/月
- Redis込み: ワンクリックでRedis追加可能
- 自動デプロイ: GitHubプッシュで自動デプロイ
- 簡単: コマンド不要、GUI操作のみ

### デプロイ手順

#### 1. Railwayにサインアップ

1. [Railway.app](https://railway.app) にアクセス
2. 「Start a New Project」をクリック
3. GitHubアカウントでログイン

#### 2. プロジェクトを作成

**GUIで操作**:

1. Dashboard → 「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. リポジトリを選択
4. Root Directory に `server` を設定
5. 「Deploy Now」をクリック

**CLIで操作（オプション）**:

```bash
# Railway CLIをインストール
npm install -g @railway/cli

# ログイン
railway login

# プロジェクトを初期化
railway init

# デプロイ
railway up
```

#### 3. Redisを追加

1. プロジェクト画面で「+ New」をクリック
2. 「Database」→ 「Add Redis」を選択
3. 自動的に `REDIS_URL` 環境変数が設定される

#### 4. 環境変数を設定

**重要**: 環境変数はRailway Dashboardで手動設定が必要です。

**手順**:

1. Railway Dashboard でデプロイしたサービス（API）をクリック
2. **Variables** タブをクリック
3. 以下の環境変数を追加:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `PORT` | Railwayが自動設定 | APIサーバーのポート番号（設定不要） |
| `REDIS_HOST` | `redis.railway.internal` | Redisの内部ホスト名 |
| `REDIS_PORT` | `6379` | Redisのポート番号 |
| `REDIS_PASSWORD` | （任意） | Redisにパスワードを設定した場合のみ |

**Redisホスト名の取得方法**:
1. 同じプロジェクト内のRedisサービスをクリック
2. **Connect** タブをクリック
3. **Private Networking** セクションに表示されるホスト名をコピー
4. 例: `redis.railway.internal` または Redisサービスの名前

**注意**:
- Redisを同じプロジェクト内に追加すると、自動的にPrivate Networkingが有効になります
- `REDIS_URL` という環境変数が自動生成される場合もありますが、個別設定を推奨します
- `PORT`環境変数はRailwayが自動的に設定するため、手動設定は不要です
- Dockerfileで `${PORT:-8000}` を使用しているため、ローカル開発では8000番ポートが使用されます

#### 5. デプロイ完了

- Railway が自動的に Dockerfile を検出してビルド
- `railway.json` の設定に基づいてデプロイされる
  - ビルダー: Dockerfile
  - 起動コマンド: `uvicorn main:socket_app --host 0.0.0.0 --port $PORT`
  - 重要: `socket_app` を使用してSocket.IOサポートを有効化
- デプロイ完了後、公開URLが発行される
- 例: `https://pure-elegance-production.up.railway.app`

#### 6. デプロイURLを取得

デプロイが完了すると、公開URLが自動生成されます。

**Railway Dashboard での確認方法**:

1. Railway Dashboard でデプロイしたサービス（API）をクリック
2. **Settings** タブをクリック
3. **Networking** セクションまでスクロール
4. **Public Networking** の下に表示される
   - 例: `https://meeting-rest-api-production.up.railway.app`
   - または **Generate Domain** ボタンをクリックしてドメインを生成

**Railway CLI での確認方法**:

```bash
# サービスの状態とURLを表示
railway status

# ブラウザでURLを開く
railway open
```

**カスタムドメインの設定（オプション）**:

1. Settings タブ → Networking セクション
2. **Custom Domain** セクションで独自ドメインを追加可能
3. DNSレコードの設定が必要

#### 7. 動作確認

デプロイURLを使ってAPIが正常に動作しているか確認します。

```bash
# デプロイされたURLにアクセス（URLを実際のものに置き換える）
curl https://your-app.up.railway.app/health

# 期待されるレスポンス:
# {"status":"healthy","redis":"connected","redis_config":{"host":"redis.railway.internal","port":6379}}

# ルートエンドポイント確認
curl https://your-app.up.railway.app/

# 期待されるレスポンス:
# {"service":"Meeting Rest System API","status":"running","version":"1.0.0",...}

# Socket.IO接続テスト
curl https://your-app.up.railway.app/socket.io/?EIO=4&transport=polling

# 期待されるレスポンス（Session IDが含まれる）:
# 0{"sid":"xxx","upgrades":[],"pingInterval":25000,"pingTimeout":20000}

# Swagger UIで確認（ブラウザで開く）
open https://your-app.up.railway.app/docs
```

**確認ポイント**:
- ✅ `/health` エンドポイントが `{"status":"healthy","redis":"connected"}` を返すこと
- ✅ `redis` が `"connected"` になっていること
- ✅ Socket.IOエンドポイント（`/socket.io/`）が正常に応答すること
- ✅ Swagger UI が正常に表示されること
- ✅ ログに `✓ Redis connected` と表示されること

---

## デプロイ後の設定

デプロイが完了したら、拡張機能とテストコンソールのAPI URLを変更する必要があります。

### Leader拡張機能のAPI URL変更

1. `extensions/leader/content.js` を開く
2. `API_BASE_URL` と Socket.IO URLを変更:

```javascript
// 変更前
const API_BASE_URL = 'http://localhost:8000';
const socket = io('http://localhost:8000', {...});

// 変更後（実際のRailway URLに置き換える）
const API_BASE_URL = 'https://your-app.up.railway.app';
const socket = io('https://your-app.up.railway.app', {
  transports: ['polling'],
  path: '/socket.io/'
});
```

3. Chrome拡張機能を再読み込み:
   - `chrome://extensions/` を開く
   - Leader拡張機能の更新ボタン（回転矢印）をクリック

### Member拡張機能のAPI URL変更

1. `extensions/member/content.js` を開く
2. `API_BASE_URL` を変更:

```javascript
// 変更前
const API_BASE_URL = 'http://localhost:8000';

// 変更後（実際のRailway URLに置き換える）
const API_BASE_URL = 'https://your-app.up.railway.app';
```

3. Chrome拡張機能を再読み込み:
   - `chrome://extensions/` を開く
   - Member拡張機能の更新ボタン（回転矢印）をクリック

### テストコンソールのAPI URL設定

`test/index.html` はAPI URLを動的に変更できます:

1. ブラウザで `test/index.html` を開く
2. **API URL** フィールドに Railway の URL を入力:
   - 例: `https://your-app.up.railway.app`
3. 自動的にローカルストレージに保存されます

### manifest.jsonの変更（重要）

Leader拡張機能とMember拡張機能がRailway URLにアクセスできるように権限を追加:

**Leader拡張機能（`extensions/leader/manifest.json`）**:
```json
{
  "host_permissions": [
    "https://meet.google.com/*",
    "http://localhost:8000/*",
    "https://your-app.up.railway.app/*"
  ]
}
```

**Member拡張機能（`extensions/member/manifest.json`）**:
```json
{
  "host_permissions": [
    "https://meet.google.com/*",
    "http://localhost:8000/*",
    "https://your-app.up.railway.app/*"
  ]
}
```

3. 両方の拡張機能を再読み込み

### 動作確認手順

1. **Leader拡張機能でまばたき検知を確認**:
   - Google Meetページを開く
   - Leader拡張機能のポップアップを開く
   - Meeting ID: `test-123`
   - 「Start」ボタンをクリック
   - ブラウザの開発者ツールを開いてログを確認:
     - `✓ Socket.IO connected` が表示されること
     - `[Blink Detection] 📹 参加者 1/N を検知中` が表示されること
     - `[Blink Detection] 🔍 まばたき検知結果: ✓ 検知` または `✗ 未検知` が表示されること

2. **Member拡張機能で休憩通知を確認**:
   - Google Meetページを開く
   - Member拡張機能のポップアップを開く
   - Meeting ID: `test-123`
   - 「接続開始」をクリック
   - Leader拡張機能でまばたきが少ない（1回以下）と判定された場合、自動的に休憩オーバーレイが表示されること

3. **ログで確認**:
   ```bash
   railway logs --follow
   ```
   - Socket.IO接続のログ: `✓ Socket.IO client connected: <sid>`
   - まばたき検知リクエスト: `✓ Received blink analysis request from <sid> for meeting test-123`
   - まばたき結果送信: `✓ Sent blink result to <sid>: blink_detected=true/false`
   - SSE接続のログ: `✓ SSE client connected: meeting_id=test-123`
   - REST APIリクエスト: `POST /api/meetings/test-123/rest`
   - Redis Pub/Sub配信: `✓ Bridged rest event to Socket.IO: test-123`

---

## 環境変数の設定

### 必須の環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `REDIS_HOST` | Redisホスト名 | `redis.railway.internal` |
| `REDIS_PORT` | Redisポート | `6379` |
| `REDIS_PASSWORD` | Redisパスワード（任意） | `your-password` |
| `PORT` | APIサーバーポート | `8000` |

### .env.example

```bash
# Redis設定
REDIS_HOST=redis.railway.internal
REDIS_PORT=6379

# サーバー設定
PORT=8000
LOG_LEVEL=INFO

# CORS設定（本番環境では制限推奨）
ALLOWED_ORIGINS=*
```

---

## モニタリングとログ

### CLIでログを確認

```bash
# ログを確認
railway logs

# リアルタイムログを表示
railway logs --follow
```

### GUI でログを確認

1. Railway Dashboard を開く
2. プロジェクトを選択
3. Service → Logs タブをクリック
4. リアルタイムログストリームが表示される

### メトリクス確認

Railway Dashboard の Metrics タブで以下を確認できます:

- CPU使用率
- メモリ使用量
- ネットワーク使用量
- リクエスト数

---

## トラブルシューティング

### 1. Socket.IO接続エラー（404 Not Found）

**症状**: `GET https://your-app.up.railway.app/socket.io/?EIO=4&transport=polling 404 (Not Found)`

**原因**: サーバーが `main:app` で起動されており、`main:socket_app` が使用されていない

**対処法**:

1. `railway.json` の `startCommand` を確認:
   ```json
   {
     "deploy": {
       "startCommand": "uvicorn main:socket_app --host 0.0.0.0 --port $PORT"
     }
   }
   ```
   **重要**: `main:app` ではなく `main:socket_app` を使用すること

2. Dockerfileの `CMD` を確認:
   ```dockerfile
   CMD uvicorn main:socket_app --host 0.0.0.0 --port ${PORT:-8000}
   ```

3. Railway Dashboardでデプロイメントログを確認:
   - `Serving on http://0.0.0.0:XXXX` が表示されること
   - `Application startup complete` が表示されること

### 2. Redis接続エラー

**症状**: サーバーがRedisに接続できない（`{"status":"degraded","redis":"disconnected"}`）

**対処法**:

```bash
# 環境変数を確認
railway variables

# Redisサービスが起動しているか確認
# Dashboard → Redis → Status を確認
```

**確認ポイント**:
- `REDIS_HOST` が正しく設定されているか（例: `redis.railway.internal`）
- Redisサービスが同じプロジェクト内にあるか
- Private Networkingが有効になっているか
- ヘルスチェックで `redis: "connected"` が表示されるか

### 3. デプロイ失敗

**症状**: ビルドやデプロイが失敗する

**対処法**:

```bash
# ログを確認
railway logs

# ビルドログを確認
# Dashboard → Deployments → 最新のデプロイ → Build Logs
```

**よくある原因**:
- `requirements.txt` に必要なパッケージが記載されていない
  - 必須: `fastapi`, `uvicorn`, `redis`, `python-socketio`, `sse-starlette`
- Dockerfileの設定が間違っている
  - `CMD` で `main:socket_app` を使用しているか確認
- Python バージョンの不一致（Python 3.11推奨）

### 4. メモリ不足

**症状**: サーバーがクラッシュする、または応答が遅い

**対処法**:

```bash
# プランを確認
railway status

# メモリ使用量を確認
# Dashboard → Metrics → Memory
```

**最適化方法**:
- 不要なパッケージを削除
- Redis接続プーリングを最適化
- 必要に応じてプランをアップグレード

### 5. 起動エラー（502 Bad Gateway）

**症状**: デプロイは成功するが、サーバーが起動しない。`502 Bad Gateway` が表示される

**原因**:
- `PORT` 環境変数が正しく設定されていない
- Dockerfileで `${PORT:-8000}` を使用していない
- サーバーが `0.0.0.0` でリッスンしていない

**対処法**:

1. Dockerfileの `CMD` を確認:
   ```dockerfile
   CMD uvicorn main:socket_app --host 0.0.0.0 --port ${PORT:-8000}
   ```
   **重要**: `$PORT` の代わりに `${PORT:-8000}` を使用（デフォルト値付き）

2. `railway.json` の `startCommand` を確認:
   ```json
   {
     "deploy": {
       "startCommand": "uvicorn main:socket_app --host 0.0.0.0 --port $PORT"
     }
   }
   ```

3. Railway Dashboardでログを確認:
   - `✓ Redis connected` が表示されること
   - `Application startup complete` が表示されること

### 6. CORS エラー

**症状**: ブラウザから API にアクセスできない。`Access to fetch at 'https://...' from origin '...' has been blocked by CORS policy`

**対処法**:

```python
# main.py にCORS設定を追加
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では具体的なオリジンを指定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO CORSも確認
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # 全オリジン許可
    logger=True,
    engineio_logger=True
)
```

---

## CI/CD 自動化（GitHub Actions）

### 自動デプロイワークフロー

`.github/workflows/deploy-railway.yml` を作成:

```yaml
name: Deploy to Railway

on:
  push:
    branches:
      - main
    paths:
      - 'server/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### 設定手順

1. Railway Dashboard → Settings → Tokens
2. 新しいトークンを生成
3. GitHub リポジトリ → Settings → Secrets and variables → Actions
4. New repository secret をクリック
5. Name: `RAILWAY_TOKEN`, Value: 生成したトークン

---

## まとめ

### デプロイの流れ

1. ✅ Railway.app にサインアップ
2. ✅ GitHubリポジトリを接続
3. ✅ Redisサービスを追加
4. ✅ 環境変数を設定（`REDIS_HOST`, `REDIS_PORT`）
5. ✅ `railway.json` で `socket_app` を指定
6. ✅ Dockerfileで `${PORT:-8000}` を使用
7. ✅ デプロイ完了

### 重要なポイント

- **Socket.IOサポート**: `uvicorn main:socket_app` を使用（`main:app` ではない）
- **PORT環境変数**: Dockerfileで `${PORT:-8000}` を使用
- **Transport**: Polling transport使用（WebSocketは無効化）
- **CORS**: 全オリジン許可（`cors_allowed_origins='*'`）
- **Redis接続**: Private Networking経由で接続

### 無料枠の制限

- $5相当/月の無料枠
- メモリ: 512MB
- ストレージ: 1GB
- ネットワーク: 100GB/月

### トラブルシューティングチェックリスト

- [ ] `railway.json` で `main:socket_app` を使用しているか
- [ ] Dockerfileで `${PORT:-8000}` を使用しているか
- [ ] `/health` エンドポイントで `redis: "connected"` が表示されるか
- [ ] Socket.IOエンドポイント（`/socket.io/`）が応答するか
- [ ] Leader拡張機能でSocket.IO接続が成功するか
- [ ] Member拡張機能でSSE接続が成功するか

### 参考リンク

- Railway公式ドキュメント: https://docs.railway.app
- Railway CLI リファレンス: https://docs.railway.app/develop/cli
- FastAPI公式ドキュメント: https://fastapi.tiangolo.com
- Socket.IO公式ドキュメント: https://socket.io/docs/v4/
- Redis公式ドキュメント: https://redis.io/documentation
