# FastAPI サーバー

このディレクトリには、会議休憩管理システムのバックエンドAPIサーバーが含まれています。

## 概要

FastAPIを使用したREST APIサーバーで、以下の機能を提供します:

- 会議の休憩状態管理（Redis）
- Server-Sent Events (SSE) **によるリアルタイム通知配信**
- 会議の開始/終了管理
- ヘルスチェックエンドポイント

## ディレクトリ構成

```
server/
├── main.py             # メインアプリケーション
├── requirements.txt    # Python依存パッケージ
├── Dockerfile          # Dockerイメージ定義
└── __pycache__/        # Pythonキャッシュ（自動生成）
```

---

## 技術スタック

- **FastAPI**: モダンなWebフレームワーク
- **Uvicorn**: ASGIサーバー
- **Redis**: インメモリデータストアとPub/Sub
- **SSE-Starlette**: Server-Sent Events実装
- **Python 3.11**: ランタイム

---

## 依存パッケージ

`requirements.txt`:

```
fastapi==0.104.1           # Webフレームワーク
uvicorn[standard]==0.24.0  # ASGIサーバー
redis==5.0.1               # Redis非同期クライアント
sse-starlette==1.8.2       # SSE実装
python-dotenv==1.0.0       # 環境変数管理
```

---

## API エンドポイント

### REST API

#### 1. ヘルスチェック

```
GET /health
```

**レスポンス**:
```json
{
  "status": "healthy",
  "redis": "connected",
  "timestamp": "2025-10-17T10:30:00Z"
}
```

#### 2. 会議開始

```
POST /api/meetings/{meeting_id}/start
```

**説明**: 会議を開始し、Redisに初期状態を保存します。

**レスポンス**:
```json
{
  "message": "Meeting started",
  "meeting_id": "abc-defg-hij"
}
```

#### 3. 休憩トリガー

```
POST /api/meetings/{meeting_id}/rest
```

**説明**: 休憩フラグを立て、全Member拡張機能にSSEで通知を配信します。

**リクエストボディ（オプション）**:
```json
{
  "message": "カスタムメッセージ"
}
```

**レスポンス**:
```json
{
  "message": "Rest notification sent",
  "meeting_id": "abc-defg-hij",
  "timestamp": "2025-10-17T10:30:00Z"
}
```

#### 4. 会議終了

```
POST /api/meetings/{meeting_id}/end
```

**説明**: 会議を終了し、Redisからデータを削除します。

**レスポンス**:
```json
{
  "message": "Meeting ended",
  "meeting_id": "abc-defg-hij"
}
```

#### 5. 会議状態取得

```
GET /api/meetings/{meeting_id}/status
```

**説明**: 現在の会議状態を取得します。

**レスポンス**:
```json
{
  "meeting_id": "abc-defg-hij",
  "rest_flg": true,
  "started_at": "2025-10-17T10:00:00Z",
  "rest_started_at": "2025-10-17T10:30:00Z"
}
```

### SSE エンドポイント

#### イベントストリーム接続

```
GET /api/sse/events?meeting_id={meeting_id}
```

**説明**: Server-Sent Eventsストリームに接続し、リアルタイム通知を受信します。

**イベント種類**:

1. **connected**: 接続確立時
```
event: connected
data: {"message": "Connected to meeting", "meeting_id": "abc-defg-hij"}
```

2. **message**: 休憩通知
```
event: message
data: {"event": "rest_required", "meeting_id": "abc-defg-hij", "message": "休憩時間です", "timestamp": "2025-10-17T10:30:00Z"}
```

3. **heartbeat**: 生存確認（30秒間隔）
```
event: heartbeat
data: {"timestamp": "2025-10-17T10:30:00Z"}
```

---

## Redisデータ構造

### キー設計

```
meeting:{meeting_id}
```

### データ形式（Hash）

```redis
HSET meeting:abc-defg-hij rest_flg "false"
HSET meeting:abc-defg-hij started_at "2025-10-17T10:00:00Z"
HSET meeting:abc-defg-hij rest_started_at ""
```

### Pub/Sub チャネル

```
meeting:{meeting_id}:rest
```

リーダーが休憩トリガーを送信すると、このチャネルに通知が配信されます。

### TTL設定

- 会議データは24時間後に自動削除: `EXPIRE meeting:{meeting_id} 86400`

---

## ローカル開発

### 前提条件

- Python 3.11以上
- Redisサーバー（Dockerまたはローカル）

### セットアップ（Python venv）

```bash
# 仮想環境を作成
cd server
python -m venv venv

# 仮想環境を有効化（Windows）
venv\Scripts\activate

# 仮想環境を有効化（Mac/Linux）
source venv/bin/activate

# 依存パッケージをインストール
pip install -r requirements.txt
```

### 環境変数設定

`.env` ファイルを作成:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # 空欄でOK（ローカル）
PORT=8000
```

### サーバー起動

```bash
# 開発モード（ホットリロード有効）
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 本番モード
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Dockerで起動

```bash
# イメージをビルド
docker build -t meeting-rest-api .

# コンテナを起動
docker run -d \
  -p 8000:8000 \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  --name meeting-api \
  meeting-rest-api
```

### Docker Composeで起動（推奨）

ルートディレクトリで:

```bash
docker-compose up -d
```

---

## 動作確認

### ヘルスチェック

```bash
curl http://localhost:8000/health
```

### Swagger UIでテスト

ブラウザで以下を開く:

```
http://localhost:8000/docs
```

- 全エンドポイントのドキュメント
- インタラクティブなAPIテスト
- レスポンススキーマの確認

### SSE接続テスト

```bash
# curlでSSE接続
curl -N http://localhost:8000/api/sse/events?meeting_id=test-123
```

別ターミナルで休憩トリガーを送信:

```bash
curl -X POST http://localhost:8000/api/meetings/test-123/rest
```

SSEストリームに `rest_required` イベントが配信されることを確認。

---

## デプロイ

詳細は `doc/infra/deploy.md` を参照してください。

### Railway（推奨）

1. [Railway.app](https://railway.app) にサインアップ
2. GitHubリポジトリを接続
3. Root Directory: `server` を設定
4. Redisサービスを追加
5. 環境変数を設定
6. デプロイ完了

### 環境変数（本番）

```bash
REDIS_HOST=redis.railway.internal
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password  # Railwayが自動設定
PORT=8000
```

---

## トラブルシューティング

### Redis接続エラー

**エラー**: `ConnectionError: Error connecting to Redis`

**対処法**:
```bash
# Redisが起動しているか確認
docker-compose ps

# Redisに接続できるか確認
redis-cli -h localhost -p 6379 ping

# 環境変数を確認
echo $REDIS_HOST
```

### ポート競合

**エラー**: `Address already in use`

**対処法**:
```bash
# ポート8000を使用しているプロセスを確認
# Windows
netstat -ano | findstr :8000

# Mac/Linux
lsof -i :8000

# プロセスを終了、または別のポートを使用
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### CORS エラー

**症状**: ブラウザから接続できない

**対処法**: `main.py` のCORS設定を確認:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番では具体的なオリジンを指定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### SSE接続が切れる

**症状**: SSEストリームが予期せず切断される

**対処法**:
1. ネットワークの安定性を確認
2. ハートビート間隔を調整（現在30秒）
3. Redisの接続を確認
4. サーバーログを確認: `docker-compose logs -f api`

---

## 開発ガイド

### コード構造

`main.py` の主要部分:

```python
# FastAPIアプリケーション
app = FastAPI()

# Redis非同期クライアント
redis_client = redis.Redis(...)

# REST API エンドポイント
@app.post("/api/meetings/{meeting_id}/rest")
async def trigger_rest(meeting_id: str):
    # 休憩フラグを設定
    # Pub/Subで通知を配信
    ...

# SSE エンドポイント
@app.get("/api/sse/events")
async def sse_events(meeting_id: str):
    async def event_generator():
        # Pub/Subをサブスクライブ
        # イベントをストリーム配信
        ...
    return EventSourceResponse(event_generator())
```

### ログの確認

```bash
# Docker Composeログ
docker-compose logs -f api

# 特定のキーワードでフィルタ
docker-compose logs api | grep "ERROR"
```

### デバッグモード

`main.py` を編集:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

---

## テスト

### 手動テスト

`test/index.html` を使用してブラウザからテスト:

```bash
# test/index.html をブラウザで開く
open test/index.html
```

### APIテスト

```bash
# 会議開始
curl -X POST http://localhost:8000/api/meetings/test-123/start

# 状態確認
curl http://localhost:8000/api/meetings/test-123/status

# 休憩トリガー
curl -X POST http://localhost:8000/api/meetings/test-123/rest

# 会議終了
curl -X POST http://localhost:8000/api/meetings/test-123/end
```

---

## パフォーマンス

### SSE接続数の制限

- Uvicornのワーカー数を調整: `--workers 4`
- Redisコネクションプールの最適化

### メモリ使用量

- Railwayの無料枠: 512MB
- 最適化: 不要なパッケージを削除

---

## セキュリティ

### 本番環境での注意点

1. **CORS設定を厳格化**:
```python
allow_origins=["https://your-domain.com"]
```

2. **API認証を追加**（将来実装）:
```python
from fastapi.security import APIKeyHeader
```

3. **Redis認証を有効化**:
```bash
REDIS_PASSWORD=strong-password
```

4. **HTTPS を使用**: RailwayやRenderは自動的にHTTPSを有効化

---

## 参考リンク

- FastAPI公式: https://fastapi.tiangolo.com
- Uvicorn公式: https://www.uvicorn.org
- Redis公式: https://redis.io
- SSE仕様: https://html.spec.whatwg.org/multipage/server-sent-events.html
