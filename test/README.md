# テストコンソール

このディレクトリには、Member拡張機能の休憩通知機能をテストするためのHTMLページが含まれています。

## 使い方

### 1. サーバーを起動

```bash
cd ..
docker-compose up -d
```

### 2. Member拡張機能をインストール

1. Chromeで `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/member` フォルダを選択

### 3. Google Meetを開く

適当なGoogle Meetのページを開きます（実際の会議でなくてもOK）。
URLから `meeting_id` を確認します。

例: `https://meet.google.com/abc-defg-hij` の場合、meeting_id は `abc-defg-hij`

### 4. テストコンソールを開く

`test/index.html` をブラウザで開きます。

```bash
# Windowsの場合
start test/index.html

# macOS/Linuxの場合
open test/index.html
```

または、直接ファイルをダブルクリックしてブラウザで開きます。

### 5. テスト実行

#### ローカル環境でテスト

1. **API URLを設定**: `http://localhost:8000`（デフォルト）
2. **Meeting IDを入力**: Google MeetのURLから取得したmeeting_idを入力
   - または、テスト用にデフォルトの `test-meeting-123` を使用
3. **計測開始**: 「🟢 計測開始」ボタンをクリック
4. **休憩トリガー**: 「☕ 休憩トリガー」ボタンをクリック
5. **確認**: Google Meetのタブで休憩オーバーレイUIが表示されることを確認

#### Railwayにデプロイした環境でテスト

1. **API URLを変更**: `https://your-app.up.railway.app`（Railwayのデプロイ先URL）
2. **Member拡張機能のAPI URLも変更**:
   - `extensions/member/content.js` の `API_BASE_URL` を変更
   - 拡張機能を再読み込み
3. 上記のローカル環境と同じ手順でテスト

**注意**: API URLは自動的にローカルストレージに保存されるため、次回開いたときに自動的に復元されます。

### 注意事項

- **同じMeeting IDを使用**: テストコンソールとGoogle MeetのURLで同じmeeting_idを使用してください
- **SSE接続**: Member拡張機能がGoogle Meetページで自動的にSSE接続を確立します（コンソールで確認可能）
- **サーバー起動確認**: テストコンソールを開くと自動的にサーバーのヘルスチェックが実行されます

## トラブルシューティング

### 休憩オーバーレイが表示されない

1. **サーバーが起動しているか確認**:
   ```bash
   docker-compose ps
   ```

2. **Meeting IDが一致しているか確認**:
   - テストコンソールで入力したmeeting_id
   - Google MeetのURLのmeeting_id
   - これらが同じであることを確認

3. **ブラウザコンソールでSSE接続を確認**:
   - Google Meetのタブで開発者ツールを開く（F12）
   - Console タブで `[Member] SSE connected` というメッセージを確認

4. **CORS設定を確認**:
   - サーバーのログを確認: `docker-compose logs -f api`

### サーバーに接続できない

```bash
# サーバーのログを確認
docker-compose logs api redis

# サーバーを再起動
docker-compose restart

# サーバーを停止して再起動
docker-compose down
docker-compose up -d
```

## ボタンの説明

- **🟢 計測開始**: 会議の計測を開始（Redisにactive=trueを保存）
- **☕ 休憩トリガー**: 休憩通知を送信（Member拡張機能にオーバーレイを表示）
- **🔴 計測終了**: 会議の計測を終了（Redisからデータを削除）
- **📊 状態確認**: 現在の会議状態を取得（active, rest_flgなど）

## 開発者向け情報

### APIエンドポイント

テストコンソールは以下のAPIエンドポイントを使用しています:

- `GET /health` - サーバーヘルスチェック
- `POST /api/meetings/{meeting_id}/start` - 計測開始
- `POST /api/meetings/{meeting_id}/rest` - 休憩トリガー
- `DELETE /api/meetings/{meeting_id}/end` - 計測終了
- `GET /api/meetings/{meeting_id}/status` - 状態確認

### Member拡張機能のSSE接続

Member拡張機能は以下のエンドポイントに接続します:

- `GET /api/sse/events?meeting_id={meeting_id}` - SSEストリーム

### デバッグ方法

1. **サーバーログ**:
   ```bash
   docker-compose logs -f api
   ```

2. **Redisの状態確認**:
   ```bash
   docker-compose exec redis redis-cli
   > KEYS meetings:*
   > HGETALL meetings:test-meeting-123
   ```

3. **ブラウザコンソール** (Google Meetタブ):
   - SSE接続状態
   - イベント受信ログ
   - エラーメッセージ
