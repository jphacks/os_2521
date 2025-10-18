# FastAPI + Redis デプロイガイド（Railway無料版）

このドキュメントでは、会議休憩管理システムのFastAPIサーバーとRedisを**Railway**を使って無料でデプロイする方法を説明します。

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

# APIドキュメント（Swagger UI）
open http://localhost:8000/docs

# Redisの状態確認
docker-compose exec redis redis-cli ping
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
| `PORT` | `8000` | APIサーバーのポート番号 |
| `REDIS_HOST` | （Redisサービス名）| Redisの内部ホスト名 |
| `REDIS_PORT` | `6379` | Redisのポート番号 |

**Redisホスト名の取得方法**:
1. 同じプロジェクト内のRedisサービスをクリック
2. **Connect** タブをクリック
3. **Private Networking** セクションに表示されるホスト名をコピー
4. 例: `redis.railway.internal` または Redisサービスの名前

**注意**:
- Redisを同じプロジェクト内に追加すると、自動的にPrivate Networkingが有効になります
- `REDIS_URL` という環境変数が自動生成される場合もありますが、個別設定を推奨します

#### 5. デプロイ完了

- Railway が自動的に Dockerfile を検出してビルド
- デプロイ完了後、公開URLが発行される
- 例: `https://meeting-rest-api-production.up.railway.app`

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
# {"status":"healthy","redis":"connected","timestamp":"..."}

# Swagger UIで確認（ブラウザで開く）
open https://your-app.up.railway.app/docs
```

**確認ポイント**:
- `/health` エンドポイントが `{"status":"healthy"}` を返すこと
- `redis` が `"connected"` になっていること
- Swagger UI が正常に表示されること

---

## デプロイ後の設定

デプロイが完了したら、拡張機能とテストコンソールのAPI URLを変更する必要があります。

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

Member拡張機能がRailway URLにアクセスできるように権限を追加:

1. `extensions/member/manifest.json` を開く
2. `host_permissions` を更新:

```json
{
  "host_permissions": [
    "https://meet.google.com/*",
    "http://localhost:8000/*",
    "https://your-app.up.railway.app/*"
  ]
}
```

3. 拡張機能を再読み込み

### 動作確認手順

1. **テストコンソールで確認**:
   - `test/index.html` を開く
   - API URLをRailway URLに設定
   - Meeting ID: `test-123`
   - 「計測開始」→「休憩トリガー」をクリック

2. **Member拡張機能で確認**:
   - Google Meetページを開く
   - Member拡張機能のポップアップを開く
   - Meeting ID: `test-123`
   - 「接続開始」をクリック
   - テストコンソールで「休憩トリガー」をクリック
   - オーバーレイUIが表示されることを確認

3. **ログで確認**:
   ```bash
   railway logs --follow
   ```
   - SSE接続のログが表示されること
   - REST APIリクエストのログが表示されること

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

### 1. Redis接続エラー

**症状**: サーバーがRedisに接続できない

**対処法**:

```bash
# 環境変数を確認
railway variables

# Redisサービスが起動しているか確認
# Dashboard → Redis → Status を確認
```

**確認ポイント**:
- `REDIS_HOST` が正しく設定されているか
- Redisサービスが同じプロジェクト内にあるか
- Private Networkingが有効になっているか

### 2. デプロイ失敗

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
- Dockerfileの設定が間違っている
- Python バージョンの不一致

### 3. メモリ不足

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

### 4. 起動エラー

**症状**: デプロイは成功するが、サーバーが起動しない

**対処法**:

1. `PORT` 環境変数が設定されているか確認
2. サーバーが `0.0.0.0` でリッスンしているか確認
3. ヘルスチェックエンドポイント (`/health`) が正常に応答するか確認

```python
# main.py の確認ポイント
import os

port = int(os.getenv("PORT", 8000))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=port)
```

### 5. CORS エラー

**症状**: ブラウザから API にアクセスできない

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

1. Railway.app にサインアップ
2. GitHubリポジトリを接続
3. Redisサービスを追加
4. 環境変数を設定
5. デプロイ完了

### 無料枠の制限

- $5相当/月の無料枠
- メモリ: 512MB
- ストレージ: 1GB
- ネットワーク: 100GB/月

### 参考リンク

- Railway公式ドキュメント: https://docs.railway.app
- Railway CLI リファレンス: https://docs.railway.app/develop/cli
- FastAPI公式ドキュメント: https://fastapi.tiangolo.com
- Redis公式ドキュメント: https://redis.io/documentation
