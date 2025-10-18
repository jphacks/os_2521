# 会議休憩管理システム ドキュメント

## 概要

Google Meet会議中に参加者のまばたきをリアルタイムで検知し、疲労度を判定して適切なタイミングで全メンバーに休憩を促すシステムです。

### システムの特徴

- **自動まばたき検知**: Socket.IOでリアルタイムにまばたきを検知
- **複数参加者対応**: 1分ごとに全参加者を巡回して疲労度を判定
- **自動休憩通知**: まばたきが少ない参加者を検知したら自動的に全員に休憩を促す
- **強制オーバーレイ**: メンバー全員の画面に休憩通知を表示
- **Chrome拡張機能**: 簡単にインストール可能
- **無料デプロイ**: Railwayで無料運用可能

### 技術構成

```
┌─────────────────┐
│ Leader拡張機能  │  まばたき検知・疲労判定
│ (Chrome)        │  ↓ Socket.IO (画像送信)
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ FastAPI Server  │  REST API + Socket.IO + SSE配信
│ (Python)        │  ↓ Redis Pub/Sub
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Redis           │  状態管理 + イベント配信
│ (In-Memory DB)  │  ↓ SSE (Server-Sent Events)
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
- まばたき検知機能の要件
- 各機能の受入基準
- 技術スタックとスコープ定義
- 成功基準

**読むべき人**: プロジェクトメンバー全員、特に初めて参加する人

#### [design.md](spec/design.md)
設計ドキュメント。システムの技術的な設計を詳細に記述しています。

- アーキテクチャ図とコンポーネント設計
- まばたき検知アルゴリズム
- データ設計（Redis構造）とAPI仕様
- Socket.IO通信設計
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
- Redis設定
- モニタリングとログ確認方法
- トラブルシューティング

**読むべき人**: インフラ担当、デプロイ担当者

#### [RAILWAY_DEPLOYMENT.md](infra/RAILWAY_DEPLOYMENT.md)
Railway専用の詳細なデプロイガイド。

**読むべき人**: Railwayでデプロイする担当者

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

### 3. 拡張機能をインストールする

```bash
# Chrome で chrome://extensions/ を開く
# 「デベロッパーモード」を有効化
# 「パッケージ化されていない拡張機能を読み込む」
# extensions/leader と extensions/member を選択
```

詳細は各ディレクトリのREADMEを参照:
- [extensions/README.md](../extensions/README.md)
- [server/README.md](../server/README.md)

### 4. 動作確認する

```bash
# 1. Google Meetに参加
https://meet.google.com/

# 2. Leader拡張機能で「Start」をクリック

# 3. ブラウザの開発者ツールを開いてログを確認
# [Blink Detection] まばたき検知を開始（2秒間隔、1分ごとに参加者を巡回）
# [Blink Detection] 📹 参加者 1/4 を検知中
# [Blink Detection] 🔍 まばたき検知結果: ✓ 検知

# 4. まばたきが少ない場合、自動的に休憩通知が表示される
```

---

## まばたき検知の仕組み

### 1. 画像キャプチャ（2秒ごと）

Leader拡張機能が参加者のビデオから画像をキャプチャしてSocket.IOでサーバーに送信します。

```javascript
// 640x480のJPEG画像にエンコード
const imageData = canvas.toDataURL('image/jpeg', 0.7);

// Socket.IOで送信
socket.emit('analyze_blink_image', {
  image: imageData,
  meeting_id: meetingId,
  participant_index: 0,  // 現在の参加者番号
  total_participants: 4,  // 総参加者数
  timestamp: new Date().toISOString()
});
```

### 2. まばたき検知（サーバー側）

現在はランダムでtrue/falseを返すモック実装です。将来的にMediaPipeで実際の検知を実装予定。

```python
# server/main.py の analyze_blink_image イベント
blink_detected = random.choice([True, False])
```

### 3. 1分間のトラッキング

クライアント側で1分間のまばたき回数をカウントします。

```javascript
// 1分間の履歴を保持
blinkHistory.push({
  detected: data.blink_detected,
  timestamp: Date.now()
});

// 1分以上古いデータを削除
blinkHistory = blinkHistory.filter(
  record => now - record.timestamp <= 60000
);
```

### 4. 自動判定

まばたきが少ない（しきい値以下）場合、自動的に休憩フラグを立てます。

```javascript
// しきい値: 1回（カスタマイズ可能）
const blinkCount = blinkHistory.filter(r => r.detected).length;

if (blinkCount <= BLINK_THRESHOLD) {
  // REST APIで休憩フラグを立てる
  fetch(`${API_BASE_URL}/api/meetings/${meetingId}/rest`, {
    method: 'POST'
  });
}
```

### 5. 参加者の巡回

1分ごとに次の参加者に切り替えて、全員を順番に検知します。

```
0:00 - 1:00  参加者1を検知（30回 × 2秒）→ まばたき判定
1:00 - 2:00  参加者2を検知（30回 × 2秒）→ まばたき判定
2:00 - 3:00  参加者3を検知（30回 × 2秒）→ まばたき判定
3:00 - 4:00  参加者4を検知（30回 × 2秒）→ まばたき判定
4:00 - 5:00  参加者1に戻る（ループ）
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
│       ├── deploy.md       # デプロイガイド
│       └── RAILWAY_DEPLOYMENT.md  # Railway詳細ガイド
│
├── extensions/              # Chrome拡張機能
│   ├── README.md           # 拡張機能の詳細
│   ├── leader/             # リーダー用
│   │   ├── manifest.json
│   │   ├── content.js      # まばたき検知ロジック
│   │   ├── socket.io.min.js # Socket.IOクライアント
│   │   ├── popup.html
│   │   └── popup.js
│   └── member/             # メンバー用
│       ├── manifest.json
│       ├── background.js   # Native Messaging管理
│       ├── content.js      # SSE接続・ブラウザ内UI
│       ├── popup.html
│       └── popup.js
│
├── server/                  # FastAPIサーバー
│   ├── README.md           # サーバーの詳細
│   ├── main.py             # メインアプリケーション
│   ├── requirements.txt    # Python依存パッケージ
│   ├── Dockerfile          # Dockerイメージ
│   ├── railway.json        # Railway設定
│   └── .dockerignore       # Docker除外ファイル
│
├── docker-compose.yml       # ローカル開発環境
├── RAILWAY_DEPLOYMENT.md    # Railwayデプロイガイド
└── README.md               # プロジェクトのREADME
```

---

## 技術スタック

### フロントエンド
- Chrome Extension Manifest V3
- Vanilla JavaScript
- HTML/CSS
- Socket.IO Client

### バックエンド
- FastAPI (Python 3.11)
- Uvicorn (ASGIサーバー)
- Redis (データストア + Pub/Sub)
- Socket.IO Server (python-socketio)

### 通信
- REST API
- Server-Sent Events (SSE)
- Socket.IO (WebSocket + Polling)

### インフラ
- Docker / Docker Compose
- Railway (無料デプロイ)

---

## よくある質問（FAQ）

### Q1. プロジェクトの目的は何ですか？

A: Google Meet会議中に、参加者のまばたきをリアルタイムで検知して疲労度を判定し、適切なタイミングで休憩を促すシステムです。

### Q2. まばたき検知はどのように動作しますか？

A:
1. Leader拡張機能が2秒ごとに参加者のビデオをキャプチャ
2. Socket.IOでサーバーに画像を送信
3. サーバーがまばたきを検知（現在はランダム、将来MediaPipe実装予定）
4. クライアント側で1分間のまばたき回数をトラッキング
5. しきい値以下の場合、自動的に休憩フラグを立てる

### Q3. 何人まで同時に検知できますか？

A: Google Meetで表示される全員のビデオを検知できます。1分ごとに参加者を巡回して検知します。

### Q4. プライバシーは守られますか？

A: はい。画像データはサーバーに送信されますが、検知結果（true/false）のみを記録し、画像自体は保存しません。

### Q5. 無料で使えますか？

A: はい。Railwayの無料枠（$5相当/月）を使用すれば完全無料で運用できます。詳細は [infra/deploy.md](infra/deploy.md) を参照してください。

### Q6. Leader拡張機能とMember拡張機能の違いは？

A:
- **Leader拡張機能**: 会議の主催者が使用。参加者のまばたきを検知して休憩トリガーを送信。
- **Member拡張機能**: 参加者全員が使用。サーバーから休憩通知を受信してブラウザ内に表示。

### Q7. どのブラウザで動作しますか？

A: Google Chrome（およびChromiumベースのブラウザ）で動作します。現在はManifest V3形式です。

### Q8. Redis は必須ですか？

A: はい。Redisは会議の状態管理とリアルタイム通知配信に使用されます。Docker Composeで簡単に起動できます。

---

## 参考リンク

### 公式ドキュメント
- Chrome Extensions: https://developer.chrome.com/docs/extensions/
- FastAPI: https://fastapi.tiangolo.com
- Socket.IO: https://socket.io/docs/v4/
- Redis: https://redis.io/documentation
- Railway: https://docs.railway.app

### このプロジェクトのドキュメント
- [要件定義](spec/requirement.md)
- [設計ドキュメント](spec/design.md)
- [タスク管理](spec/tasks.md)
- [デプロイガイド](infra/deploy.md)
- [Railwayデプロイガイド](infra/RAILWAY_DEPLOYMENT.md)

### コンポーネント別ドキュメント
- [Chrome拡張機能](../extensions/README.md)
- [FastAPIサーバー](../server/README.md)
