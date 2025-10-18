from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import redis.asyncio as redis
import socketio
import json
import asyncio
import os
import random
from datetime import datetime
from typing import AsyncGenerator

app = FastAPI(title="Meeting Rest System API")

# Socket.IOサーバーを作成（CORS完全開放）
# ワイルドカードで全てのオリジンを許可
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # 全てのオリジンを許可
    logger=True,
    engineio_logger=True
)

# Socket.IOをASGIアプリケーションとしてマウント
socket_app = socketio.ASGIApp(sio, app)

# CORS設定（Chrome拡張機能からのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP用に全て許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis接続設定
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

redis_client: redis.Redis = None


@app.on_event("startup")
async def startup_event():
    """アプリケーション起動時にRedis接続を確立"""
    global redis_client
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True
    )
    try:
        await redis_client.ping()
        print(f"✓ Redis connected: {REDIS_HOST}:{REDIS_PORT}")
    except Exception as e:
        print(f"✗ Redis connection failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """アプリケーション終了時にRedis接続をクローズ"""
    if redis_client:
        await redis_client.close()


@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    try:
        await redis_client.ping()
        return {"status": "healthy", "redis": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "redis": "disconnected", "error": str(e)}


@app.post("/api/meetings/{meeting_id}/start")
async def start_meeting(meeting_id: str):
    """
    会議の計測を開始する
    - Redisに meetings:{meeting_id}:active = true を保存（TTL: 3時間）
    """
    await redis_client.setex(
        f"meetings:{meeting_id}:active",
        10800,  # 3時間
        "true"
    )
    await redis_client.setex(
        f"meetings:{meeting_id}:started_at",
        10800,
        datetime.utcnow().isoformat()
    )
    return {
        "status": "started",
        "meeting_id": meeting_id,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.delete("/api/meetings/{meeting_id}/end")
async def end_meeting(meeting_id: str):
    """
    会議の計測を終了する
    - Redisから meetings:{meeting_id}:active を削除
    """
    await redis_client.delete(f"meetings:{meeting_id}:active")
    await redis_client.delete(f"meetings:{meeting_id}:started_at")
    await redis_client.delete(f"meetings:{meeting_id}:rest_flg")
    return {
        "status": "ended",
        "meeting_id": meeting_id,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/meetings/{meeting_id}/rest")
async def trigger_rest(meeting_id: str):
    """
    休憩をトリガーする
    - Redisに rest_flg = true を保存（TTL: 60分）
    - Redis Pub/Subでイベントを発行
    """
    timestamp = datetime.utcnow().isoformat()

    # rest_flgを設定
    await redis_client.setex(
        f"meetings:{meeting_id}:rest_flg",
        3600,  # 60分
        "true"
    )
    await redis_client.setex(
        f"meetings:{meeting_id}:rest_started_at",
        3600,
        timestamp
    )

    # Pub/Subでイベントを発行
    event_data = {
        "event": "rest_required",
        "meeting_id": meeting_id,
        "timestamp": timestamp,
        "message": "休憩時間です"
    }
    await redis_client.publish(
        f"meeting:{meeting_id}:rest",
        json.dumps(event_data)
    )

    return {
        "status": "ok",
        "meeting_id": meeting_id,
        "timestamp": timestamp
    }


@app.post("/api/meetings/{meeting_id}/rest-request")
async def request_rest(meeting_id: str):
    """
    匿名で休憩希望を送信する（1人でも押したら全員に休憩通知）
    - Redisに rest_flg = true を保存（TTL: 60分）
    - Redis Pub/Subでイベントを発行
    """
    timestamp = datetime.utcnow().isoformat()

    # rest_flgを設定
    await redis_client.setex(
        f"meetings:{meeting_id}:rest_flg",
        3600,  # 60分
        "true"
    )
    await redis_client.setex(
        f"meetings:{meeting_id}:rest_started_at",
        3600,
        timestamp
    )

    # Pub/Subでイベントを発行
    event_data = {
        "event": "rest_required",
        "meeting_id": meeting_id,
        "timestamp": timestamp,
        "message": "休憩時間です（メンバーからのリクエスト）"
    }
    await redis_client.publish(
        f"meeting:{meeting_id}:rest",
        json.dumps(event_data)
    )

    return {
        "status": "ok",
        "meeting_id": meeting_id,
        "timestamp": timestamp
    }


@app.get("/api/meetings/{meeting_id}/status")
async def get_meeting_status(meeting_id: str):
    """
    会議の状態を取得する
    """
    active = await redis_client.get(f"meetings:{meeting_id}:active")
    rest_flg = await redis_client.get(f"meetings:{meeting_id}:rest_flg")
    started_at = await redis_client.get(f"meetings:{meeting_id}:started_at")
    rest_started_at = await redis_client.get(f"meetings:{meeting_id}:rest_started_at")

    return {
        "meeting_id": meeting_id,
        "active": active == "true",
        "rest_flg": rest_flg == "true",
        "started_at": started_at,
        "rest_started_at": rest_started_at
    }


@app.get("/api/sse/events")
async def sse_events(meeting_id: str):
    """
    SSE（Server-Sent Events）エンドポイント
    - Redis Pub/Subを購読してイベントをストリーミング
    - ハートビート（30秒間隔）を送信
    """
    async def event_generator() -> AsyncGenerator[dict, None]:
        # Pub/Sub用のRedis接続を新規作成
        pubsub_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True
        )
        pubsub = pubsub_client.pubsub()

        try:
            # 会議の休憩チャンネルを購読
            await pubsub.subscribe(f"meeting:{meeting_id}:rest")
            print(f"✓ SSE client connected: meeting_id={meeting_id}")

            # 接続確立メッセージ
            yield {
                "event": "connected",
                "data": json.dumps({
                    "meeting_id": meeting_id,
                    "timestamp": datetime.utcnow().isoformat()
                })
            }

            # ハートビート用のタイマー
            last_heartbeat = asyncio.get_event_loop().time()
            heartbeat_interval = 30  # 30秒

            while True:
                # メッセージを非ブロッキングで取得
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=1.0
                    )

                    if message and message['type'] == 'message':
                        # Pub/Subから受信したイベントを送信
                        yield {
                            "event": "message",
                            "data": message['data']
                        }

                except asyncio.TimeoutError:
                    pass

                # ハートビート送信
                current_time = asyncio.get_event_loop().time()
                if current_time - last_heartbeat >= heartbeat_interval:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                    last_heartbeat = current_time

                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            print(f"✓ SSE client disconnected: meeting_id={meeting_id}")

        finally:
            await pubsub.unsubscribe(f"meeting:{meeting_id}:rest")
            await pubsub.close()
            await pubsub_client.close()

    return EventSourceResponse(event_generator())


@app.post("/api/meetings/{meeting_id}/page-info")
async def receive_page_info(meeting_id: str, page_info: dict):
    """
    Chrome拡張機能からページ情報を受信し、Socket.IOで配信する
    """
    timestamp = datetime.utcnow().isoformat()

    # Redisに保存
    await redis_client.setex(
        f"meetings:{meeting_id}:page_info",
        300,  # 5分
        json.dumps(page_info)
    )

    # Socket.IOで接続中のElectronクライアントに配信
    await sio.emit('page_info', {
        'meeting_id': meeting_id,
        'title': page_info.get('title', ''),
        'url': page_info.get('url', ''),
        'timestamp': timestamp
    }, room=f'meeting:{meeting_id}')

    print(f"✓ Page info received and broadcasted: {meeting_id}")

    return {
        "status": "ok",
        "meeting_id": meeting_id,
        "timestamp": timestamp
    }


# Socket.IOイベントハンドラ
@sio.event
async def connect(sid, environ):
    """クライアント接続時"""
    print(f"✓ Socket.IO client connected: {sid}")


@sio.event
async def disconnect(sid):
    """クライアント切断時"""
    print(f"✗ Socket.IO client disconnected: {sid}")


@sio.event
async def join_meeting(sid, data):
    """会議ルームに参加"""
    meeting_id = data.get('meeting_id')
    if meeting_id:
        room_name = f'meeting:{meeting_id}'
        await sio.enter_room(sid, room_name)
        print(f"✓ Client {sid} joined room: {room_name}")

        # 最新のページ情報を送信
        page_info_json = await redis_client.get(f"meetings:{meeting_id}:page_info")
        if page_info_json:
            page_info = json.loads(page_info_json)
            await sio.emit('page_info', {
                'meeting_id': meeting_id,
                **page_info
            }, room=sid)


@sio.event
async def leave_meeting(sid, data):
    """会議ルームから退出"""
    meeting_id = data.get('meeting_id')
    if meeting_id:
        room_name = f'meeting:{meeting_id}'
        await sio.leave_room(sid, room_name)
        print(f"✓ Client {sid} left room: {room_name}")


@sio.event
async def analyze_blink_image(sid, data):
    """
    まばたき検知用画像を受信してランダムな結果を返す

    Args:
        sid: クライアントのセッションID
        data: {
            'image': 'base64エンコードされた画像データ',
            'meeting_id': 'ミーティングID',
            'timestamp': 'クライアント側のタイムスタンプ'
        }

    Returns:
        Socket.IOで 'blink_result' イベントを送信
        {
            'blink_detected': true/false (ランダム),
            'timestamp': 'サーバー側のタイムスタンプ',
            'meeting_id': 'ミーティングID'
        }
    """
    meeting_id = data.get('meeting_id')
    image_data = data.get('image')
    client_timestamp = data.get('timestamp')

    print(f"✓ Received blink analysis request from {sid} for meeting {meeting_id}")

    # ランダムにtrue/falseを生成（まばたき検知のモック）
    blink_detected = random.choice([True, False])

    # 結果を返送
    result = {
        'blink_detected': blink_detected,
        # 'meeting_id': meeting_id,
        'server_timestamp': datetime.utcnow().isoformat(),
        'client_timestamp': client_timestamp,
        'status': 'ok'
    }

    # クライアントに結果を送信
    await sio.emit('blink_result', result, room=sid)

    print(f"✓ Sent blink result to {sid}: blink_detected={blink_detected}")

    return result


# Redisの休憩イベントをSocket.IOにブリッジするタスク
async def bridge_rest_events_to_socketio():
    """
    Redisの休憩イベントをSocket.IOクライアントに転送
    """
    pubsub_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True
    )
    pubsub = pubsub_client.pubsub()

    # すべての休憩チャンネルを購読（パターンマッチ）
    await pubsub.psubscribe('meeting:*:rest')

    print("✓ Started bridging Redis events to Socket.IO")

    try:
        async for message in pubsub.listen():
            if message['type'] == 'pmessage':
                # チャンネル名から meeting_id を抽出
                channel = message['channel']
                meeting_id = channel.split(':')[1]

                # イベントデータをパース
                event_data = json.loads(message['data'])

                # Socket.IOで配信
                await sio.emit('rest_required', event_data, room=f'meeting:{meeting_id}')
                print(f"✓ Bridged rest event to Socket.IO: {meeting_id}")
    finally:
        await pubsub.close()
        await pubsub_client.close()


@app.on_event("startup")
async def startup_bridge():
    """Redis→Socket.IOブリッジを起動"""
    asyncio.create_task(bridge_rest_events_to_socketio())


if __name__ == "__main__":
    import uvicorn
    # socket_appを使用してSocket.IOサポートを有効化
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
