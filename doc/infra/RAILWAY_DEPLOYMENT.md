# Railway デプロイメントガイド

## 前提条件

- Railwayアカウント
- GitHub リポジトリ

## デプロイ手順

### 1. Redisサービスをデプロイ

1. Railway ダッシュボードで **New Project** をクリック
2. **Deploy from GitHub repo** を選択
3. リポジトリを選択
4. **Add a new service** → **Database** → **Redis** を選択
5. Redis サービスがデプロイされるのを待つ

### 2. FastAPI サーバーをデプロイ

1. 同じプロジェクトで **New Service** をクリック
2. **Deploy from GitHub repo** を選択
3. リポジトリを選択
4. **Root Directory** を `server` に設定

### 3. 環境変数を設定

FastAPI サービスの環境変数を設定：

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `REDIS_HOST` | `redis.railway.internal` | Redis ホスト（Railway内部ネットワーク） |
| `REDIS_PORT` | `6379` | Redis ポート |
| `REDIS_PASSWORD` | （Redisサービスから取得） | Redis パスワード |

**Redisパスワードの取得方法:**
1. Redis サービスをクリック
2. **Variables** タブを開く
3. `REDIS_PASSWORD` の値をコピー
4. FastAPI サービスの環境変数に設定

### 4. デプロイ設定

Railway は自動的に以下を検出します:
- `server/Dockerfile` - Dockerビルド
- `server/railway.json` - デプロイ設定

### 5. デプロイの確認

デプロイが完了したら、以下のエンドポイントを確認:

```bash
# ルートエンドポイント
curl https://your-app.up.railway.app/

# ヘルスチェック
curl https://your-app.up.railway.app/health

# API ドキュメント
https://your-app.up.railway.app/docs
```

**期待されるレスポンス:**

```json
// ルート
{
  "service": "Meeting Rest System API",
  "status": "running",
  "version": "1.0.0"
}

// ヘルスチェック
{
  "status": "healthy",
  "redis": "connected",
  "redis_config": {
    "host": "redis.railway.internal",
    "port": 6379
  }
}
```

## トラブルシューティング

### 502 Bad Gateway

**原因:** サーバーが起動していない、またはクラッシュしている

**解決方法:**
1. Railway ダッシュボードで **Deployments** タブを開く
2. 最新のデプロイのログを確認
3. エラーメッセージを確認

### Redis 接続エラー

**原因:** Redis 環境変数が正しく設定されていない

**解決方法:**
1. FastAPI サービスの **Variables** タブを開く
2. 以下を確認:
   - `REDIS_HOST` = `redis.railway.internal`
   - `REDIS_PORT` = `6379`
   - `REDIS_PASSWORD` = （Redisサービスのパスワード）

### CORS エラー

**原因:** サーバーのCORS設定が正しくない

**解決方法:**
- `server/main.py` の CORS 設定を確認
- `allow_origins=["*"]` が設定されているか確認

## Chrome拡張機能の設定

デプロイ後、Chrome拡張機能のAPI URLを更新:

1. 拡張機能のポップアップを開く
2. **API URL** に Railway の URL を入力:
   ```
   https://your-app.up.railway.app
   ```
3. **接続開始** をクリック

## 環境変数一覧

### FastAPI サービス

| 変数名 | 必須 | デフォルト値 | 説明 |
|--------|------|------------|------|
| `PORT` | 自動設定 | - | Railway が自動設定 |
| `REDIS_HOST` | ✓ | `localhost` | Redis ホスト |
| `REDIS_PORT` | ✓ | `6379` | Redis ポート |
| `REDIS_PASSWORD` | ○ | `None` | Redis パスワード |

### Redis サービス

Railway が自動的に設定します。

## カスタムドメイン（オプション）

1. Railway ダッシュボードで FastAPI サービスを開く
2. **Settings** タブを開く
3. **Generate Domain** をクリック
4. カスタムドメインを追加（オプション）

## スケーリング

Railwayは自動的にスケールします:
- メモリ: 自動調整
- CPU: 自動調整
- インスタンス数: 1つ（Free tier）

## 費用

- **Free tier**: $5/月のクレジット
- **超過分**: 従量課金

## 参考リンク

- [Railway ドキュメント](https://docs.railway.app/)
- [FastAPI デプロイガイド](https://fastapi.tiangolo.com/deployment/)
- [Socket.IO デプロイガイド](https://socket.io/docs/v4/server-installation/)
