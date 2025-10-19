(() => {
  const SIZE = 224;
  const FPS = 4;               // ポップアップへ送る静止画は軽めでOK
  const MIN_VW = 200, MIN_VH = 150;

  // videoごとの描画ループ状態
  const sessions = new WeakMap();
  let running = false;
  let mo = null;

  // 休憩通知システムの変数
  let API_BASE_URL = window.MEETING_REST_CONFIG
    ? window.MEETING_REST_CONFIG.DEFAULT_API_URL
    : 'http://localhost:8000';
  let eventSource = null;
  let meetingId = null;
  let overlayElement = null;
  let pageInfoInterval = null;

  // Socket.IO変数（まばたき検知用）
  let socket = null;
  let blinkDetectionInterval = null;
  const BLINK_DETECTION_INTERVAL = 170;

  // まばたき検知の履歴（60秒間トラッキング）
  let blinkHistory = [];
  const BLINK_THRESHOLD = 20; // 60秒間で20回以下なら休憩フラグ

  // 参加者の巡回用
  let currentParticipantIndex = 0; // 現在検知中の参加者インデックス
  let participantRotationInterval = null; // 参加者切り替え用タイマー
  const PARTICIPANT_ROTATION_INTERVAL = 60000; // 60秒ごとに参加者を切り替え

  // 定期判定用タイマー
  let blinkJudgmentInterval = null;
  const JUDGMENT_INTERVAL = 60000; // 60秒ごとに判定

  function* walkShadow(node) {
    yield node;
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let cur;
    while ((cur = tw.nextNode())) {
      if (cur.shadowRoot) yield* walkShadow(cur.shadowRoot);
    }
  }

  function findCandidateVideos() {
    const arr = [];
    for (const root of walkShadow(document)) {
      if (root.querySelectorAll) root.querySelectorAll('video').forEach(v => arr.push(v));
    }
    return arr.filter(v => (v.videoWidth | 0) >= MIN_VW && (v.videoHeight | 0) >= MIN_VH);
  }

  function startOne(videoEl, index) {
    if (sessions.has(videoEl)) return;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const minDt = 1000 / FPS;
    let last = 0;

    async function pushFrame(ts) {
      if (!running || !videoEl.isConnected || !sessions.has(videoEl)) return;
      if (!videoEl.videoWidth) return;

      if (ts - last >= minDt) {
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        const s = Math.min(SIZE / vw, SIZE / vh);
        const dw = (vw * s) | 0, dh = (vh * s) | 0;
        const dx = (SIZE - dw) >> 1, dy = (SIZE - dh) >> 1;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(videoEl, 0, 0, vw, vh, dx, dy, dw, dh);

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        const dataUrl = await blobToDataURL(blob);
        chrome.runtime.sendMessage({ type: 'FRAME', index, dataUrl, w: vw, h: vh });
        last = ts;
      }
      // 継続コールは pushFrame 内で行う（requestVideoFrameCallback を使う）
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        videoEl.requestVideoFrameCallback(pushFrame);
      }
    }

    // kick を定義してループを開始する
    function kick() {
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        videoEl.requestVideoFrameCallback(pushFrame);
      } else {
        // フォールバック: setInterval で代用（軽量プレビューなので十分）
        const id = setInterval(() => {
          try { pushFrame(performance.now()); } catch (e) {}
          if (!sessions.has(videoEl) || !running) clearInterval(id);
        }, minDt);
      }
    }

    sessions.set(videoEl, { index, canvas, ctx });
    if (videoEl.readyState >= 2) kick();
    else videoEl.addEventListener('loadeddata', kick, { once: true });
  }

  function stopAll() {
    running = false;
    // WeakMapはforEach不可。参照を外せばGCされる。
    // 動的監視も停止
    if (mo) { mo.disconnect(); mo = null; }
  }

  function scanAndAttachAll() {
    const vids = findCandidateVideos();
    chrome.runtime.sendMessage({ type: 'VIDEOS_COUNT', count: vids.length });
    vids.forEach((v, idx) => startOne(v, idx));
  }

  function enableDynamicAttach() {
    if (mo) return;
    mo = new MutationObserver(() => { if (running) scanAndAttachAll(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // 初回
    scanAndAttachAll();
  }

  function blobToDataURL(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  }


  /**
   * ポップアップにステータスを通知
   */
  function notifyStatus(status, text) {
    chrome.runtime.sendMessage({
      type: 'status_update',
      status: status,
      text: text
    }).catch(() => {
      // ポップアップが開いていない場合はエラーを無視
    });
  }

  /**
   * ページ情報を送信
   */
  async function sendPageInfo() {
    if (!meetingId) return;

    try {
      const pageInfo = {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString()
      };

      await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/page-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pageInfo)
      });
    } catch (error) {
      console.error('[Leader] Error sending page info:', error);
    }
  }

  /**
   * ページ情報の定期送信を開始
   */
  function startPageInfoMonitoring() {
    if (pageInfoInterval) {
      return;
    }

    // 即座に1回送信
    sendPageInfo();

    // 5秒ごとに送信
    pageInfoInterval = setInterval(sendPageInfo, 5000);
  }

  /**
   * ページ情報の定期送信を停止
   */
  function stopPageInfoMonitoring() {
    if (pageInfoInterval) {
      clearInterval(pageInfoInterval);
      pageInfoInterval = null;
    }
  }

  /**
   * SSE接続を切断
   */
  function disconnectSSE() {
    stopPageInfoMonitoring();

    if (eventSource) {
      eventSource.close();
      eventSource = null;
      notifyStatus('', '未接続');
    }
  }

  /**
   * SSE接続を開始
   */
  function startSSEConnection() {
    if (eventSource) {
      notifyStatus('connected', '接続済み ✓');
      return;
    }

    if (!meetingId) {
      notifyStatus('error', 'Meeting IDが未設定');
      return;
    }

    notifyStatus('connecting', '接続中...');

    const sseUrl = `${API_BASE_URL}/api/sse/events?meeting_id=${meetingId}`;
    eventSource = new EventSource(sseUrl);

    // 接続確立
    eventSource.addEventListener('connected', (event) => {
      notifyStatus('connected', '接続済み ✓');

      // ページ情報の監視を開始
      startPageInfoMonitoring();
    });

    // 休憩通知イベント
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'rest_required') {
          showRestOverlay(data);
        }
      } catch (error) {
        console.error('[Leader] Failed to parse SSE message:', error);
      }
    });

    // ハートビート
    eventSource.addEventListener('heartbeat', () => {
      // ハートビートを受信（何もしない）
    });

    // エラーハンドリング
    eventSource.onerror = (error) => {
      console.error('[Leader] SSE error:', error);
      notifyStatus('error', '接続エラー');

      // 接続が切れた場合は再接続を試みる
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource = null;
        notifyStatus('connecting', '再接続中...');
        setTimeout(startSSEConnection, 5000);
      }
    };
  }

  /**
   * 休憩オーバーレイUIを表示（ウィンドウ全体をブロック）
   */
  function showRestOverlay(data = {}) {
    if (overlayElement && document.body.contains(overlayElement)) return;

    overlayElement = document.createElement('div');
    overlayElement.id = 'meeting-rest-overlay';
    overlayElement.innerHTML = `
      <div style="
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.3);
        pointer-events: all;
        user-select: none;
        backdrop-filter: blur(4px);
      ">
        <div class="overlay-card">
          <svg class="mail-icon" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="15" y="30" width="90" height="60" rx="8" fill="#ffffffff" stroke="#6B9E7E" stroke-width="3"/>
            <path d="M15 35 L60 65 L105 35" stroke="#6B9E7E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M15 35 L60 65 L105 35" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <h1 class="title">ひとやすみ通信</h1>
          <p class="subtitle">休憩のお知らせが届きました</p>
          <div class="message-box">
            <p class="message-text">
              ${data.message || '会議が長くなってきました🌱<br>少し休憩して、リフレッシュしましょう'}
            </p>
          </div>
          <button class="button" id="meeting-rest-ok-btn">わかりました 🌸</button>
          <div class="footer-message">
            <span>🌿</span>
            <span>心と体を大切に</span>
            <span>🌿</span>
          </div>
        </div>
      </div>
    `;

    // CSSを追加
    const style = document.createElement('style');
    style.textContent = `
      .overlay-card {
        background: #FFFEF9;
        border: 3px solid #8BC4A8;
        border-radius: 32px;
        padding: 40px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        text-align: center;
      }
      .mail-icon {
        width: 120px;
        height: 120px;
        margin: 0 auto 24px;
        animation: gentle-bounce 3s ease-in-out infinite;
      }
      @keyframes gentle-bounce {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-8px); }
      }
      .title {
        font-size: 32px;
        font-weight: 600;
        color: #6B9E7E;
        margin-bottom: 12px;
        letter-spacing: 2px;
      }
      .subtitle {
        font-size: 16px;
        color: #8B7355;
        margin-bottom: 24px;
      }
      .message-box {
        background: #FFF5E6;
        border-left: 4px solid #E8B4A0;
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 28px;
        text-align: left;
      }
      .message-text {
        font-size: 15px;
        color: #6B5D4F;
        line-height: 1.8;
      }
      .button {
        background: #A8D5BA;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 16px 48px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(168, 213, 186, 0.3);
      }
      .button:hover {
        background: #92C5A7;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(168, 213, 186, 0.4);
      }
      .button:active {
        transform: translateY(0);
      }
      .footer-message {
        margin-top: 20px;
        font-size: 13px;
        color: #A8B5A0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      body.rest-overlay-active { overflow: hidden !important; pointer-events: none !important; }
      #meeting-rest-overlay { pointer-events: all !important; }
    `;
    document.head.appendChild(style);

    document.body.classList.add('rest-overlay-active');
    document.body.appendChild(overlayElement);

    document.getElementById('meeting-rest-ok-btn')?.addEventListener('click', hideRestOverlay);

    // Escキーでも閉じられないようにする
    const preventEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', preventEscape, true);
    overlayElement._preventEscape = preventEscape;

    playNotificationSound();
  }

  /**
   * 休憩オーバーレイUIを非表示
   */
  function hideRestOverlay() {
    if (!overlayElement) return;

    // Escキーイベントリスナーを削除
    if (overlayElement._preventEscape) {
      document.removeEventListener('keydown', overlayElement._preventEscape, true);
    }

    // bodyのクラスを削除
    document.body.classList.remove('rest-overlay-active');

    // フェードアウトアニメーション
    overlayElement.style.animation = 'fadeOut 0.3s ease-in-out';

    setTimeout(() => {
      if (overlayElement && document.body.contains(overlayElement)) {
        document.body.removeChild(overlayElement);
        overlayElement = null;
      }
    }, 300);
  }

  /**
   * 通知音を再生（オプション）
   */
  function playNotificationSound() {
    try {
      // Web Audio APIで簡単な通知音を生成
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('[Leader] Failed to play notification sound:', error);
    }
  }

  /**
   * Socket.IOが利用可能か確認
   */
  function checkSocketIO() {
    if (typeof io !== 'undefined') {
        return true;
    } else {
      console.error('[Blink Detection] Socket.IO is not loaded');
      return false;
    }
  }

  /**
   * Socket.IO接続を確立（接続完了まで待機）
   */
  async function connectToBlinkDetectionServer() {
    try {
      // Socket.IOが利用可能か確認
      if (!checkSocketIO()) {
        throw new Error('Socket.IO is not available');
      }

      if (socket && socket.connected) {
        console.log('[Blink Detection] Already connected to server');
        return Promise.resolve();
      }

      // 接続完了をPromiseで待つ
      return new Promise((resolve, reject) => {
        console.log('[Blink Detection] Connecting to:', API_BASE_URL);
        socket = io(API_BASE_URL, {
          transports: ['polling', 'websocket'],  // polling優先でwebsocketもフォールバック
          path: '/socket.io/',
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
        });

        socket.on('connect', () => {
          console.log('[Blink Detection] ✓ Socket.IO connected successfully');
          // 会議ルームに参加
          if (meetingId) {
            socket.emit('join_meeting', { meeting_id: meetingId });
            console.log('[Blink Detection] Joined meeting room:', meetingId);
          }

          // 接続完了を通知
          resolve();
        });

        socket.on('disconnect', () => {
          console.log('[Blink Detection] 接続が切断されました');
        });

        socket.on('blink_result', (data) => {
          // デバッグログ（必要に応じてコメントアウト解除）
          console.log('[Blink Detection] 🔍 まばたき検知結果:', data.blink_detected ? '✓ 検知' : '✗ 未検知');

          // まばたき検知結果を履歴に追加
          blinkHistory.push({
            detected: data.blink_detected
          });
        });

        socket.on('connect_error', (error) => {
          console.error('[Blink Detection] Connection error:', error);
          reject(error);
        });

        socket.on('error', (error) => {
          console.error('[Blink Detection] Socket.IO error:', error);
        });

        // タイムアウト（10秒）
        setTimeout(() => {
          if (!socket.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

    } catch (error) {
      console.error('[Blink Detection] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * videoからフレームをキャプチャしてSocket.IOで送信
   */
  function captureAndSendBlinkImage() {
    if (!socket || !socket.connected) {
      return;
    }

    if (!meetingId) {
      return;
    }

    // すべてのビデオ要素を取得
    const videos = findCandidateVideos();
    if (videos.length === 0) {
      return;
    }

    // 現在のインデックスが範囲外の場合、0にリセット
    if (currentParticipantIndex >= videos.length) {
      currentParticipantIndex = 0;
    }

    // 現在の参加者のビデオを取得
    const video = videos[currentParticipantIndex];
    console.log(`[Blink Detection] 📹 参加者 ${currentParticipantIndex + 1}/${videos.length} を検知中`);

    // Canvasにビデオフレームを描画
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // JPEG形式でBase64エンコード
    const imageData = canvas.toDataURL('image/jpeg', 0.7);

    // Socket.IOで送信
    socket.emit('analyze_blink_image', {
      image: imageData,
      meeting_id: meetingId,
      participant_index: currentParticipantIndex,
      total_participants: videos.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 次の参加者に切り替える
   */
  function rotateToNextParticipant() {
    const videos = findCandidateVideos();
    if (videos.length === 0) {
      currentParticipantIndex = 0;
      return;
    }

    // 次の参加者に移動（ループ）
    currentParticipantIndex = (currentParticipantIndex + 1) % videos.length;
    console.log(`[Blink Detection] 🔄 次の参加者に切り替え: ${currentParticipantIndex + 1}/${videos.length}`);

    // まばたき履歴をリセット（新しい参加者の検知開始）
    blinkHistory = [];
  }

  /**
   * まばたき検知の自動送信を開始
   */
  function startBlinkDetection() {
    if (blinkDetectionInterval) {
      return;
    }

    console.log('[Blink Detection] まばたき検知を開始（170ms間隔でデータ収集、60秒ごとに判定）');

    // 初期化
    currentParticipantIndex = 0;
    blinkHistory = [];

    // 即座に1回送信
    captureAndSendBlinkImage();

    // 定期的に送信（170msごと）
    blinkDetectionInterval = setInterval(() => {
      captureAndSendBlinkImage();
    }, BLINK_DETECTION_INTERVAL);

    // 定期的に判定（60秒ごと）
    blinkJudgmentInterval = setInterval(() => {
      judgeBlinkFrequency();
    }, JUDGMENT_INTERVAL);

    // 60秒ごとに参加者を切り替え
    participantRotationInterval = setInterval(() => {
      rotateToNextParticipant();
    }, PARTICIPANT_ROTATION_INTERVAL);

    console.log('[Blink Detection] ⏱️ 60秒後に初回判定を実施します');
  }

  /**
   * まばたき検知の自動送信を停止
   */
  function stopBlinkDetection() {
    if (blinkDetectionInterval) {
      clearInterval(blinkDetectionInterval);
      blinkDetectionInterval = null;
      console.log('[Blink Detection] まばたき検知を停止');
    }

    if (blinkJudgmentInterval) {
      clearInterval(blinkJudgmentInterval);
      blinkJudgmentInterval = null;
      console.log('[Blink Detection] 定期判定を停止');
    }

    if (participantRotationInterval) {
      clearInterval(participantRotationInterval);
      participantRotationInterval = null;
      console.log('[Blink Detection] 参加者ローテーションを停止');
    }

    // 状態をリセット
    blinkHistory = [];
    currentParticipantIndex = 0;
  }

  /**
   * 60秒ごとにまばたき回数を判定する
   */
  function judgeBlinkFrequency() {
    const blinkCount = blinkHistory.filter(record => record.detected).length;
    const totalRecords = blinkHistory.length;

    console.log(`[Blink Detection] 📊 60秒間のまばたき回数: ${blinkCount}回 / ${totalRecords}回の検知`);

    // まばたきが閾値以上の場合、休憩フラグを立てる
    if (blinkCount >= BLINK_THRESHOLD) {
      console.warn(`[Blink Detection] ⚠️ まばたきが少なすぎます（${blinkCount}回）- 休憩を促します`);
      triggerRestBreak();
    } else {
      console.log(`[Blink Detection] ✓ まばたき回数は正常範囲内です`);
    }

    // 履歴をリセットして次の60秒間の測定を開始
    blinkHistory = [];
    console.log(`[Blink Detection] 🔄 履歴をリセット - 次の60秒間の測定を開始`);
  }

  /**
   * 休憩を促すフラグを立てる
   */
  async function triggerRestBreak() {
    if (!meetingId) {
      console.error('[Blink Detection] Meeting IDがありません');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/rest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('[Blink Detection] ✓ 休憩フラグを立てました');
      } else {
        console.error('[Blink Detection] 休憩フラグの設定に失敗:', response.status);
      }
    } catch (error) {
      console.error('[Blink Detection] 休憩フラグの設定エラー:', error);
    }
  }

  /**
   * URLからMeeting IDを抽出
   */
  function extractMeetingIdFromURL() {
    try {
      const url = window.location.href;
      // Google MeetのURL形式: https://meet.google.com/abc-defg-hij
      const match = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
      if (match && match[1]) {
        return match[1];
      }
      return null;
    } catch (error) {
      console.error('[Leader] Failed to extract meeting ID:', error);
      return null;
    }
  }

  /**
   * ページ読み込み完了後に初期化
   */
  function initRestSystem() {
    // URLからMeeting IDを抽出
    const urlMeetingId = extractMeetingIdFromURL();
    if (urlMeetingId) {
      meetingId = urlMeetingId;
    }

    // ストレージから接続状態とAPI URLを復元
    chrome.storage.local.get(['meetingId', 'apiUrl', 'isConnected'], (result) => {
      if (result.apiUrl) {
        API_BASE_URL = result.apiUrl;
      }

      // ストレージのMeeting IDがあればそれを優先
      if (result.meetingId) {
        meetingId = result.meetingId;
      }

      if (result.isConnected && meetingId) {
        startSSEConnection();
      }
    });
  }

  // ポップアップからの操作を受ける
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === 'START') {
      running = true;
      enableDynamicAttach();
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'running…' });

      // Meeting IDを確認・抽出
      if (!meetingId) {
        meetingId = extractMeetingIdFromURL();
        if (!meetingId) {
          console.error('[Blink Detection] Meeting IDを取得できませんでした');
        }
      }

      // まばたき検知を開始
      if (meetingId) {
        connectToBlinkDetectionServer()
          .then(() => {
            startBlinkDetection();
          })
          .catch((error) => {
            console.error('[Blink Detection] 接続失敗:', error.message);
          });
      } else {
        console.error('[Blink Detection] Meeting IDが取得できませんでした');
      }

      sendResponse && sendResponse({});
      return true;
    }
    if (msg.cmd === 'STOP') {
      stopAll();
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'stopped' });

      // まばたき検知を停止
      stopBlinkDetection();

      sendResponse && sendResponse({});
      return true;
    }
    // 休憩通知システムのメッセージハンドリング
    if (msg.action === 'connect') {
      try {
        meetingId = msg.meetingId;

        // API URLが指定されていれば更新
        if (msg.apiUrl) {
          API_BASE_URL = msg.apiUrl;
        }

        disconnectSSE();
        startSSEConnection();

        // Socket.IO接続も確立（まばたき検知用）
        connectToBlinkDetectionServer();
        sendResponse({ success: true, message: 'Connected' });
      } catch (error) {
        console.error('[Leader] Connection failed:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    } else if (msg.action === 'disconnect') {
      try {
        disconnectSSE();

        // まばたき検知を停止
        stopBlinkDetection();

        // Socket.IO接続を切断
        if (socket) {
          socket.disconnect();
          socket = null;
        }

        sendResponse({ success: true, message: 'Disconnected' });
      } catch (error) {
        console.error('[Leader] Disconnect failed:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    } else if (msg.action === 'show_rest_overlay') {
      try {
        showRestOverlay(msg.data);
        sendResponse({ success: true, message: 'Rest overlay displayed' });
      } catch (error) {
        console.error('[Leader] Failed to show rest overlay:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  // ページ読み込み完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRestSystem);
  } else {
    initRestSystem();
  }

  // ページ遷移時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // まばたき検知を停止
    stopBlinkDetection();

    // Socket.IO接続を切断
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  });
})();