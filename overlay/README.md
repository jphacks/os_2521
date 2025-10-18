# Electronオーバーレイアプリケーション

このElectronアプリケーションは、ブラウザのページ情報をリアルタイムでデスクトップオーバーレイに表示し、休憩通知を全画面で表示します。

## データフロー

### 新方式（Chrome拡張機能から直接接続）

```
Chrome Extension (member)
    ↓ (Meeting ID & API URL) Chrome Native Messaging
Native Messaging Host (Node.js)
    ↓ TCP (localhost:9876)
Electron Overlay (デスクトップオーバーレイ)
    ↓ (ページ情報を5秒ごとに送信) WebSocket
FastAPI Server (Socket.IO)
```

### 従来方式（環境変数で設定）

```
Chrome Extension (member)
    ↓ (ページ情報を5秒ごとに送信)
FastAPI Server (Socket.IO)
    ↓ (WebSocketでリアルタイム配信)
Electron Overlay (デスクトップオーバーレイ)
```

## 機能

1. **ページ情報の表示**
   - ブラウザのタイトル、URL、会議IDを右上に表示
   - 5秒ごとに自動更新

2. **休憩通知の表示**
   - 全画面オーバーレイで休憩通知を表示
   - OKボタンで閉じる
   - 通知音を再生

## セットアップ

### クイックスタート（Chrome拡張機能から接続 - 推奨）

詳細な手順は [SETUP.md](./SETUP.md) を参照してください。

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

### 従来の方法（環境変数で設定）

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

## 使い方

### 基本的な使い方

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

### 会議IDの設定

会議IDは環境変数で設定できます。Google MeetのURLから会議IDを取得して設定してください。

例：`https://meet.google.com/abc-defg-hij` の場合、会議IDは `abc-defg-hij`

```bash
set MEETING_ID=abc-defg-hij
npm run start:overlay
```

## ファイル構成

```
overlay/
├── main.js          # Electronメインプロセス
├── preload.js       # プリロードスクリプト（IPC通信）
├── overlay.html     # オーバーレイUI
├── renderer.js      # レンダラープロセス
└── README.md        # このファイル
```

## トラブルシューティング

### オーバーレイが表示されない

1. Electronが正しく起動しているか確認
2. コンソールログを確認して接続状態を確認
3. サーバーが起動しているか確認（http://localhost:8000/health）

### ページ情報が更新されない

1. Chrome拡張機能が正しく接続されているか確認
2. ブラウザのコンソールログを確認
3. サーバーのログを確認（ページ情報受信のログが出力されているか）

### 休憩通知が表示されない

1. Socket.IO接続が確立されているか確認
2. 会議IDが一致しているか確認
3. Redisが起動しているか確認

## 開発者向け情報

### デバッグ

main.js の以下の行のコメントを外すと、開発者ツールが開きます：

```javascript
// overlayWindow.webContents.openDevTools({ mode: 'detach' });
```

### Socket.IOイベント

- `connect`: サーバーに接続
- `disconnect`: サーバーから切断
- `page_info`: ページ情報を受信
- `rest_required`: 休憩通知を受信
- `join_meeting`: 会議ルームに参加

### カスタマイズ

#### オーバーレイのスタイル変更

`overlay.html` のCSSを編集してスタイルを変更できます。

#### 更新間隔の変更

Chrome拡張機能（extensions/member/content.js）の以下の行を編集：

```javascript
pageInfoInterval = setInterval(sendPageInfo, 5000); // 5000ms = 5秒
```

## ライセンス

MIT
