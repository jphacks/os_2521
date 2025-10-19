# Member拡張機能

Google Meet会議中に休憩通知を受信してオーバーレイUIを表示します。

## 設定方法

### API URLの設定

#### 方法1: .envファイルから自動生成（推奨）

1. プロジェクトルートの `.env` ファイルを編集:

```bash
DEFAULT_API_URL=https://your-app.up.railway.app
```

2. プロジェクトルートディレクトリで以下を実行:

```bash
node scripts/build-config.js
```

3. `extensions/member/config.js` が自動生成されます

**初回セットアップ時**:
```bash
# .env.example をコピー
cp .env.example .env

# .env を編集してRailway URLを設定
# DEFAULT_API_URL=https://your-app.up.railway.app

# config.jsを生成
node scripts/build-config.js
```

#### 方法2: ポップアップで動的に変更

1. Chrome拡張機能のポップアップを開く
2. API URLフィールドに入力
3. 自動的にローカルストレージに保存される

## インストール

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/member` ディレクトリを選択

## 使い方

1. Google Meetページを開く
2. 拡張機能アイコンをクリック
3. Meeting IDを入力（またはURLから自動取得）
4. 「接続開始」をクリック
5. リーダーから休憩通知が来ると、画面全体にオーバーレイが表示されます

## 機能

- SSE（Server-Sent Events）でリアルタイム通知を受信
- 全画面オーバーレイUIで強制的に休憩を促す
- Escキーでも閉じられない
- 画面外の操作を完全にブロック
- 音声通知（オプション）
- Meeting IDのURLからの自動取得
- API URLの動的切り替え

## トラブルシューティング

### 接続できない

1. API URLが正しいか確認
2. サーバーが起動しているか確認
3. manifest.jsonのhost_permissionsにURLが含まれているか確認
4. 拡張機能を再読み込み
5. Chromeのコンソール（F12）でエラーを確認

### オーバーレイが表示されない

1. Member拡張機能が「接続済み」状態か確認
2. Meeting IDがtest/index.htmlと一致しているか確認
3. コンソールで `[Member] SSE event received` が出ているか確認

## ファイル構成

- `manifest.json`: 拡張機能の設定
- `config.js`: API URLの設定
- `content.js`: Google Meetページに挿入されるスクリプト
- `popup.html/popup.js`: ポップアップUI
- `README.md`: このファイル
