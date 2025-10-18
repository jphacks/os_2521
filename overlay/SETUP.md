# Electronオーバーレイ セットアップガイド

このガイドでは、Chrome拡張機能からElectronオーバーレイに直接接続情報（Meeting IDとAPI Base URL）を送信する機能のセットアップ方法を説明します。

## アーキテクチャ

```
Chrome Extension (member)
    ↓ Chrome Native Messaging
Native Messaging Host (Node.js)
    ↓ TCP (localhost:9876)
Electron Overlay App
    ↓ WebSocket (Socket.IO)
FastAPI Server
```

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Chrome拡張機能の読み込み

1. Chromeで `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `extensions/member` フォルダを選択
5. **拡張機能のIDをコピー**（例: `abcdefghijklmnopqrstuvwxyz123456`）

### 3. Native Messaging Hostの設定

#### 3-1. マニフェストファイルの更新

`overlay/com.meeting.rest.overlay.json` を開き、`allowed_origins` の `YOUR_EXTENSION_ID` を実際の拡張機能IDに置き換えます:

```json
{
  "name": "com.meeting.rest.overlay",
  "description": "Meeting Rest Overlay Native Host",
  "path": "C:\\Users\\YourName\\path\\to\\overlay\\native-host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://abcdefghijklmnopqrstuvwxyz123456/"
  ]
}
```

#### 3-2. Native Hostのインストール

##### Windows

```bash
npm run install:native-host
```

このコマンドは以下を実行します:
1. マニフェストファイルの作成
2. Windowsレジストリへの登録

**注意**: 初回実行時は `YOUR_EXTENSION_ID` のままなので、上記の手順で拡張機能IDを更新してから再度実行してください。

##### macOS

```bash
npm run install:native-host
```

マニフェストファイルが `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` にコピーされます。

##### Linux

```bash
npm run install:native-host
```

マニフェストファイルが `~/.config/google-chrome/NativeMessagingHosts/` にコピーされます。

### 4. Electronオーバーレイの起動

```bash
npm run start:overlay
```

起動すると以下のメッセージが表示されます:
```
✓ Overlay window created
✓ TCP server listening on port 9876
Waiting for connection info from Chrome extension...
```

### 5. 動作確認

1. **サーバーを起動**
   ```bash
   cd server
   python main.py
   ```

2. **Google Meetにアクセス**
   - Chromeで Google Meet (https://meet.google.com/xxx-xxxx-xxx) にアクセス

3. **拡張機能を接続**
   - 拡張機能のアイコンをクリック
   - Meeting IDとAPI URLを入力
   - 「接続」をクリック

4. **オーバーレイの確認**
   - Electronアプリのコンソールに以下のログが表示されることを確認:
     ```
     ✓ Native host connected
     Received from native host: { type: 'connect', meetingId: '...', apiBaseUrl: '...' }
     ✓ Updated connection info - Meeting ID: xxx-xxxx-xxx, API: http://localhost:8000
     Connecting to WebSocket: http://localhost:8000
     ✓ WebSocket connected
     ```

   - デスクトップ右上にページ情報が表示されます

## トラブルシューティング

### Native hostに接続できない

**症状**: Chrome拡張機能のコンソールに以下のエラーが表示される:
```
Error: Specified native messaging host not found.
```

**解決策**:
1. マニフェストファイルの `allowed_origins` が正しい拡張機能IDになっているか確認
2. `npm run install:native-host` を再実行
3. Chromeを再起動

### Electronアプリに接続できない

**症状**: Native hostのログ (`overlay/native-host.log`) に `Electron not connected` と表示される

**解決策**:
1. Electronアプリが起動しているか確認
2. ポート 9876 が他のアプリで使用されていないか確認
3. Electronアプリを再起動

### オーバーレイが表示されない

**症状**: 拡張機能は接続されているが、オーバーレイに何も表示されない

**解決策**:
1. Electronアプリのコンソールログを確認
2. サーバーが起動しているか確認 (`http://localhost:8000/health`)
3. Meeting IDが正しいか確認

### ログの確認

- **Chrome拡張機能**: Chromeのデベロッパーツール > コンソール
- **Native Host**: `overlay/native-host.log`
- **Electronアプリ**: ターミナルの出力

## アンインストール

Native Messaging Hostをアンインストールする場合:

```bash
npm run uninstall:native-host
```

## 開発者向け情報

### デバッグモード

Electronアプリの開発者ツールを開くには、`overlay/main.js` の以下の行のコメントを外します:

```javascript
overlayWindow.webContents.openDevTools({ mode: 'detach' });
```

### ポートの変更

TCPポートを変更する場合は、以下のファイルを更新してください:
- `overlay/main.js`: `const TCP_PORT = 9876;`
- `overlay/native-host.js`: `const ELECTRON_PORT = 9876;`

### 環境変数での起動（従来の方法）

環境変数を使用して起動することも可能です（Native Messaging不要）:

```bash
# Windows
set API_BASE_URL=http://localhost:8000
set MEETING_ID=abc-defg-hij
npm run start:overlay

# macOS/Linux
export API_BASE_URL=http://localhost:8000
export MEETING_ID=abc-defg-hij
npm run start:overlay
```

## ライセンス

MIT
