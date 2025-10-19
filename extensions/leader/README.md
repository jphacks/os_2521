# ひとやすみ通信 - Leader

リーダー用Chrome拡張機能。参加者のまばたきを検知して、疲労をモニタリングします。

## 設定方法

### config.jsでのURL設定

`config.js`ファイルでサーバーURLを管理します：

```javascript
window.MEETING_REST_CONFIG = {
  // Railway本番環境のURL（デプロイ後に更新してください）
  DEFAULT_API_URL: 'https://your-app.up.railway.app',

  // ローカル開発環境のURL
  LOCAL_API_URL: 'http://localhost:8000'
};
```

### URLプリセットボタン

- **🏠 LOCAL**: ローカル開発環境（http://localhost:8000）
- **🚀 RAILWAY**: Railway本番環境（config.jsで設定したURL）
- **✏️ カスタム**: 自由にURLを入力可能

## 使い方

1. Google Meetの会議に参加
2. 拡張機能アイコンをクリック
3. Meeting IDが自動取得されます
4. 接続先URLを選択（LOCAL/RAILWAY/カスタム）
5. 「🚀 接続して監視を開始」をクリック
6. まばたき検知が開始されます

## デバッグ方法

ポップアップを開いた状態で：
1. 右クリック → 「検証」をクリック
2. Consoleタブで以下のログを確認：
   - `[Popup] Preset button clicked`
   - `[Popup] Setting URL preset`
   - `[Popup] Connect button clicked`

## トラブルシューティング

### URLが変更できない
- ブラウザのコンソールでエラーを確認
- `chrome://extensions/` で拡張機能をリロード
- LOCAL/RAILWAYボタンをクリックすると読み取り専用になります
- カスタムボタンで編集可能になります

### 接続ボタンが押せない
- Meeting IDが自動取得されているか確認
- Google Meetのページで拡張機能を開いているか確認
- コンソールで `[Popup] Connect button event listener attached` が表示されているか確認
