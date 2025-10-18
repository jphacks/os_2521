# 会議休憩管理システム 実装タスクリスト（2日間MVP）

## MVP範囲
リーダーが計測開始→瞬き検知で疲労度判定→自動/手動で休憩トリガー→全メンバーに休憩UI表示→計測終了

## 📅 Day 1: サーバー実装（7.5時間）

### ✅ 1.1 環境セットアップ（1時間）

- プロジェクトフォルダ作成（server/, extensions/leader/, extensions/member/）
- Docker Compose設定（Redis）
- Redis起動確認（docker-compose up -d）

**要件:** 環境構築

### ✅ 1.2 FastAPI基本実装（1.5時間）

- requirements.txt作成（fastapi, uvicorn, redis, sse-starlette）
- main.py実装（FastAPIアプリ、CORS設定）
- GET /health エンドポイント
- ローカル起動確認（http://localhost:8000/docs）

**要件:** 2.1, 2.2

### ✅ 1.3 Redis接続とREST API（2.5時間）

- redis_client.py実装（Redis接続）
- **POST /api/meetings/{room_id}/start** 実装（新規）
  - Redisに meetings:{room_id}:active=true 保存（TTL: 3時間）
  - レスポンス: {"status": "started"}
- **DELETE /api/meetings/{room_id}/end** 実装（新規）
  - Redisから meetings:{room_id}:active を削除
  - レスポンス: {"status": "ended"}
- POST /api/meetings/{id}/rest 実装
  - Redisに rest_flg=true 保存（TTL: 60分）
  - PUBLISH meeting:{id}:rest 発行
- GET /api/meetings/{id}/status 実装
- Postmanでテスト

**要件:** 2.1, 2.2, 3.1

### ✅ 1.4 SSE + Pub/Sub実装（3.5時間）

- GET /api/sse/events?meeting_id={id} 実装（sse-starletteを使用）
- Redis Pub/Sub Subscribe実装
- Pub/Sub → SSE ブリッジ実装
- ハートビート実装（30秒間隔）
- curlでSSE接続テスト
- 別ターミナルでPOST /rest → SSE受信確認

**要件:** 4.1, 4.2

## 📅 Day 2: 拡張機能実装 + 瞬き検知 + テスト（9.5時間）

### ✅ 2.1 メンバー拡張機能（2.5時間）

- extensions/member/manifest.json作成

```json
{
  "manifest_version": 3,
  "name": "Meeting Rest Member",
  "version": "1.0",
  "permissions": ["activeTab", "storage"],
  "content_scripts": [{
    "matches": ["https://meet.google.com/*"],
    "js": ["content.js"]
  }]
}
```

- content.js実装
  - SSE接続（EventSource）
  - rest_requiredイベント受信
  - オーバーレイUI表示（HTML文字列をDOMに注入）
  - OKボタンでUI非表示
- CSS実装（z-index: 999999、半透明背景）
- Chrome拡張機能として読み込み＋動作確認

**要件:** 5.1, 5.2

### ✅ 2.2 リーダー拡張機能（4.5時間）

- extensions/leader/manifest.json作成
- content.js実装
  - meeting_idをURLから抽出（meet.google.com/{meeting_id}）
  - **「計測開始」ボタン追加（新規）**
    - POST /api/meetings/{room_id}/start を呼ぶ
    - 瞬き検知を開始
    - 成功時にボタンを無効化
  - **「計測終了」ボタン追加（新規）**
    - DELETE /api/meetings/{room_id}/end を呼ぶ
    - 瞬き検知を停止
  - 「休憩」ボタン追加（手動トリガー用）
    - 計測中のみ有効
- blink-detector.js実装（簡易版）
  - setInterval（1分ごと）でランダム値生成（8-15回/分）
  - 5分間のデータを配列に保存
  - 平均瞬き回数を計算
  - 計測開始/終了で制御
- fatigue-judge.js実装
  - しきい値判定: 平均10回/分未満で疲労と判定
  - 自動トリガー: 判定結果がtrueならPOST /api/meetings/{id}/rest
  - 手動トリガー: ボタンクリックで即座に送信
- 成功/失敗のトーストメッセージ表示
- Chrome拡張機能として読み込み＋動作確認

**要件:** 1.1, 10.1

### ✅ 2.3 統合テスト（2時間）

- 2人でテスト（1リーダー + 1メンバー）
  - リーダーがGoogle Meetに参加
  - **「計測開始」ボタンをクリック（新規）**
  - メンバーが同じMeetに参加
  - 瞬き検知が動作していることを確認（コンソールログで確認）
  - 5分待機し、自動トリガーが発火することを確認
  - メンバーのブラウザにオーバーレイUIが表示されることを確認
  - OKボタンでUI非表示を確認
  - 手動「休憩」ボタンでも即座にトリガーできることを確認
  - **「計測終了」ボタンで終了できることを確認（新規）**
- エラーケース確認
  - サーバー停止時の挙動
  - SSE再接続の動作
- README.md作成（セットアップ手順、使い方）

**要件:** 成功基準

### ✅ 2.4 調整・バグ修正（0.5時間）

- 発見したバグの修正
- エラーメッセージの改善
- 最終動作確認

**要件:** 全体

## 📂 最小限のファイル構成

```
meeting-rest-system/
├── docker-compose.yml
├── README.md
│
├── server/
│   ├── requirements.txt
│   ├── main.py                 # FastAPI + CORS + エンドポイント
│   └── redis_client.py         # Redis接続
│
└── extensions/
    ├── leader/
    │   ├── manifest.json
    │   ├── content.js          # ボタンUI + 統合
    │   ├── blink-detector.js   # 瞬き検知（簡易版）
    │   └── fatigue-judge.js    # 疲労度判定 + 自動トリガー
    │
    └── member/
        ├── manifest.json
        └── content.js          # SSE接続 + オーバーレイUI
```

## 📊 進捗チェックリスト

| Day | タスク | 所要時間 | 完了 |
|-----|--------|----------|------|
| 1 | 環境セットアップ | 1h | ☐ |
| 1 | FastAPI基本実装 | 1.5h | ☐ |
| 1 | Redis + REST API（計測開始/終了追加） | 2.5h | ☐ |
| 1 | SSE + Pub/Sub | 2.5h | ☐ |
| 2 | メンバー拡張機能 | 2.5h | ☐ |
| 2 | リーダー拡張機能 + 瞬き検知（計測開始/終了追加） | 4.5h | ☐ |
| 2 | 統合テスト | 2h | ☐ |
| 2 | バグ修正 | 0.5h | ☐ |

**合計: 17時間（Day 1: 7.5時間、Day 2: 9.5時間）**

## 🎯 最小限の成功基準

- ✓ **リーダーが「計測開始」ボタンで会議を開始できる（新規）**
- ✓ 瞬き検知が動作する（簡易版でランダム値生成）
- ✓ 疲労度判定が動作する（平均10回/分未満で自動トリガー）
- ✓ リーダーが「休憩」ボタンをクリック→メンバーにオーバーレイ表示（手動トリガー）
- ✓ **リーダーが「計測終了」ボタンで会議を終了できる（新規）**
- ✓ 2人（1リーダー + 1メンバー）で動作確認
- ✓ README.mdが存在し、セットアップ手順が記載されている

## 🚫 実装しない機能（スコープ外）

- ❌ 高精度な瞬き検知（MediaPipe等、簡易版のみ実装）
- ❌ 複数会議の同時管理
- ❌ 詳細なエラーハンドリング
- ❌ 認証・API Key
- ❌ カウントダウンタイマー（オーバーレイは即時表示のみ）
- ❌ 休憩終了機能（TTLで自動削除）
- ❌ プライバシー対応（同意画面なし）
- ❌ ログ・監視・メトリクス
- ❌ 詳細なドキュメント
- ❌ デモ動画・プレゼン資料

## 💡 実装のポイント

### Day 1のコツ

- Redis: Docker Composeで即起動、複雑な設定不要
- FastAPI: シンプルな構成、エラーハンドリングは最小限
- SSE: sse-starletteライブラリを使えば簡単
- テスト: curlで確認すれば十分

### Day 2のコツ

- 拡張機能: manifest.jsonとcontent.js 1ファイルだけ
- UI: 複雑なCSSは不要、シンプルな全画面オーバーレイ
- SSE接続: EventSource APIは数行で実装可能
- meeting_id: URLから正規表現で抽出（meet.google.com/{id}）

### 最優先事項

- 動くものを作る（品質は二の次）
- シンプルに（複雑な機能は削除）
- テストは最小限（2人で動作確認できればOK）

## 📝 簡易コードサンプル

### server/main.py（骨格）

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import redis.asyncio as redis
import json

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# 【新規】計測開始API
@app.post("/api/meetings/{room_id}/start")
async def start_meeting(room_id: str):
    await r.setex(f"meetings:{room_id}:active", 10800, "true")  # TTL: 3時間
    return {"status": "started"}

# 【新規】計測終了API
@app.delete("/api/meetings/{room_id}/end")
async def end_meeting(room_id: str):
    await r.delete(f"meetings:{room_id}:active")
    return {"status": "ended"}

# 休憩トリガーAPI
@app.post("/api/meetings/{meeting_id}/rest")
async def trigger_rest(meeting_id: str):
    await r.setex(f"meetings:{meeting_id}:rest_flg", 3600, "true")
    await r.publish(f"meeting:{meeting_id}:rest",
                    json.dumps({"event": "rest_required"}))
    return {"status": "ok"}

# SSE接続API
@app.get("/api/sse/events")
async def sse_events(meeting_id: str):
    async def event_generator():
        pubsub = r.pubsub()
        await pubsub.subscribe(f"meeting:{meeting_id}:rest")
        async for message in pubsub.listen():
            if message['type'] == 'message':
                yield {"event": "message", "data": message['data']}
    return EventSourceResponse(event_generator())
```

### extensions/member/content.js（骨格）

```javascript
// SSE接続
const meetingId = window.location.pathname.split('/')[1];
const eventSource = new EventSource(
  `http://localhost:8000/api/sse/events?meeting_id=${meetingId}`
);

eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.event === 'rest_required') {
    showOverlay();
  }
});

function showOverlay() {
  const overlay = document.createElement('div');
  overlay.innerHTML = `
    <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; 
                background:rgba(0,0,0,0.9); z-index:999999; 
                display:flex; align-items:center; justify-content:center;">
      <div style="background:white; padding:40px; border-radius:10px;">
        <h1>休憩時間です</h1>
        <button onclick="this.closest('div').remove()">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}
```

### extensions/leader/content.js（骨格）

```javascript
const meetingId = window.location.pathname.split('/')[1];
let isMonitoring = false;
let blinkInterval = null;

// 【新規】計測開始ボタン
const startBtn = document.createElement('button');
startBtn.textContent = '計測開始';
startBtn.style.cssText = 'position:fixed; top:10px; right:200px; z-index:9999; padding:10px;';
startBtn.onclick = async () => {
  const response = await fetch(
    `http://localhost:8000/api/meetings/${meetingId}/start`,
    { method: 'POST' }
  );
  if (response.ok) {
    isMonitoring = true;
    startBlinkDetection();
    startBtn.disabled = true;
    restBtn.disabled = false;
    endBtn.disabled = false;
    alert('計測を開始しました');
  }
};
document.body.appendChild(startBtn);

// 休憩ボタン
const restBtn = document.createElement('button');
restBtn.textContent = '休憩';
restBtn.style.cssText = 'position:fixed; top:10px; right:100px; z-index:9999; padding:10px;';
restBtn.disabled = true;  // 計測開始後に有効化
restBtn.onclick = async () => {
  await triggerRest();
};
document.body.appendChild(restBtn);

// 【新規】計測終了ボタン
const endBtn = document.createElement('button');
endBtn.textContent = '計測終了';
endBtn.style.cssText = 'position:fixed; top:10px; right:10px; z-index:9999; padding:10px;';
endBtn.disabled = true;  // 計測開始後に有効化
endBtn.onclick = async () => {
  const response = await fetch(
    `http://localhost:8000/api/meetings/${meetingId}/end`,
    { method: 'DELETE' }
  );
  if (response.ok) {
    isMonitoring = false;
    stopBlinkDetection();
    startBtn.disabled = false;
    restBtn.disabled = true;
    endBtn.disabled = true;
    alert('計測を終了しました');
  }
};
document.body.appendChild(endBtn);

// 瞬き検知開始
function startBlinkDetection() {
  const blinkData = [];
  blinkInterval = setInterval(() => {
    if (!isMonitoring) return;

    const blinksPerMin = Math.floor(Math.random() * 8) + 8; // 8-15回/分
    blinkData.push(blinksPerMin);
    if (blinkData.length > 5) blinkData.shift(); // 5分間のデータを保持
    console.log('瞬き回数:', blinksPerMin, '平均:', getAverage(blinkData));

    // 疲労度判定
    if (blinkData.length === 5 && getAverage(blinkData) < 10) {
      console.log('疲労検知！自動トリガー');
      triggerRest();
    }
  }, 60000); // 1分ごと
}

// 瞬き検知停止
function stopBlinkDetection() {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
  }
}

function getAverage(data) {
  return data.reduce((a, b) => a + b, 0) / data.length;
}

async function triggerRest() {
  const response = await fetch(
    `http://localhost:8000/api/meetings/${meetingId}/rest`,
    { method: 'POST' }
  );
  if (response.ok) {
    alert('休憩通知を送信しました');
  }
}
```