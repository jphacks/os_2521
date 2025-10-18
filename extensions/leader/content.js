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

      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/page-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pageInfo)
      });

      if (response.ok) {
        console.log('[Leader] Page info sent:', pageInfo);
      } else {
        console.error('[Leader] Failed to send page info:', response.status);
      }
    } catch (error) {
      console.error('[Leader] Error sending page info:', error);
    }
  }

  /**
   * ページ情報の定期送信を開始
   */
  function startPageInfoMonitoring() {
    if (pageInfoInterval) {
      console.log('[Leader] Page info monitoring already started');
      return;
    }

    // 即座に1回送信
    sendPageInfo();

    // 5秒ごとに送信
    pageInfoInterval = setInterval(sendPageInfo, 5000);
    console.log('[Leader] Started page info monitoring (every 5 seconds)');
  }

  /**
   * ページ情報の定期送信を停止
   */
  function stopPageInfoMonitoring() {
    if (pageInfoInterval) {
      clearInterval(pageInfoInterval);
      pageInfoInterval = null;
      console.log('[Leader] Stopped page info monitoring');
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
      console.log('[Leader] Disconnected from SSE');
    }
  }

  /**
   * SSE接続を開始
   */
  function startSSEConnection() {
    if (eventSource) {
      console.log('[Leader] SSE already connected');
      notifyStatus('connected', '接続済み ✓');
      return;
    }

    if (!meetingId) {
      console.error('[Leader] No meeting_id provided');
      notifyStatus('error', 'Meeting IDが未設定');
      return;
    }

    notifyStatus('connecting', '接続中...');

    const sseUrl = `${API_BASE_URL}/api/sse/events?meeting_id=${meetingId}`;
    console.log(`[Leader] Connecting to SSE: ${sseUrl}`);

    eventSource = new EventSource(sseUrl);

    // 接続確立
    eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('[Leader] SSE connected:', data);
      notifyStatus('connected', '接続済み ✓');

      // ページ情報の監視を開始
      startPageInfoMonitoring();
    });

    // 休憩通知イベント
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Leader] SSE event received:', data);

        if (data.event === 'rest_required') {
          showRestOverlay(data);
        }
      } catch (error) {
        console.error('[Leader] Failed to parse SSE message:', error);
      }
    });

    // ハートビート
    eventSource.addEventListener('heartbeat', (event) => {
      const data = JSON.parse(event.data);
      console.log('[Leader] Heartbeat:', data.timestamp);
    });

    // エラーハンドリング
    eventSource.onerror = (error) => {
      console.error('[Leader] SSE error:', error);
      notifyStatus('error', '接続エラー');

      // 接続が切れた場合は再接続を試みる
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[Leader] SSE connection closed. Reconnecting in 5 seconds...');
        eventSource = null;
        notifyStatus('connecting', '再接続中... (5秒後)');
        setTimeout(startSSEConnection, 5000);
      }
    };
  }

  /**
   * 休憩オーバーレイUIを表示（ウィンドウ全体をブロック）
   */
  function showRestOverlay(data) {
    // 既にオーバーレイが表示されている場合はスキップ
    if (overlayElement && document.body.contains(overlayElement)) {
      console.log('[Leader] Overlay already shown');
      return;
    }

    console.log('[Leader] Showing rest overlay - BLOCKING MODE');

    // オーバーレイ要素を作成
    overlayElement = document.createElement('div');
    overlayElement.id = 'meeting-rest-overlay';
    overlayElement.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.98);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Google Sans', 'Roboto', sans-serif;
        animation: fadeIn 0.3s ease-in-out;
        pointer-events: all;
        user-select: none;
      ">
        <div style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 80px 100px;
          border-radius: 20px;
          text-align: center;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
          max-width: 700px;
          user-select: none;
        ">
          <div style="font-size: 96px; margin-bottom: 30px; animation: bounce 2s infinite;">☕</div>
          <h1 style="
            font-size: 56px;
            font-weight: 700;
            color: white;
            margin: 0 0 30px 0;
            text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.4);
            user-select: none;
          ">休憩時間です</h1>
          <p style="
            font-size: 22px;
            color: rgba(255, 255, 255, 0.95);
            margin: 0 0 50px 0;
            line-height: 1.8;
            user-select: none;
          ">
            ${data.message || '少し休憩して、リフレッシュしましょう'}
          </p>
          <button id="meeting-rest-ok-btn" style="
            background: white;
            color: #667eea;
            border: none;
            padding: 20px 60px;
            font-size: 20px;
            font-weight: 700;
            border-radius: 40px;
            cursor: pointer;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            user-select: none;
          " onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 8px 20px rgba(0, 0, 0, 0.4)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 6px 16px rgba(0, 0, 0, 0.3)';">
            OK
          </button>
        </div>
      </div>
    `;

    // フェードインアニメーション用のスタイルを追加
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: scale(0.9);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes fadeOut {
        from {
          opacity: 1;
          transform: scale(1);
        }
        to {
          opacity: 0;
          transform: scale(0.9);
        }
      }
      @keyframes bounce {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-20px);
        }
      }
      /* すべてのマウスイベントをブロック */
      body.rest-overlay-active {
        overflow: hidden !important;
        pointer-events: none !important;
      }
      #meeting-rest-overlay {
        pointer-events: all !important;
      }
    `;
    document.head.appendChild(style);

    // bodyにクラスを追加してスクロールを無効化
    document.body.classList.add('rest-overlay-active');

    // OKボタンのクリックイベント
    document.body.appendChild(overlayElement);
    const okButton = document.getElementById('meeting-rest-ok-btn');
    okButton.addEventListener('click', hideRestOverlay);

    // Escキーでも閉じられないようにする
    const preventEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', preventEscape, true);
    overlayElement._preventEscape = preventEscape;

    // 音声通知（オプション）
    playNotificationSound();
  }

  /**
   * 休憩オーバーレイUIを非表示
   */
  function hideRestOverlay() {
    if (!overlayElement) return;

    console.log('[Leader] Hiding rest overlay');

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
   * ページ読み込み完了後に初期化
   */
  function initRestSystem() {
    console.log('[Leader] Rest system initialized');

    // ストレージから接続状態とAPI URLを復元
    chrome.storage.local.get(['meetingId', 'apiUrl', 'isConnected'], (result) => {
      if (result.apiUrl) {
        API_BASE_URL = result.apiUrl;
        console.log('[Leader] API URL loaded:', API_BASE_URL);
      }

      if (result.isConnected && result.meetingId) {
        meetingId = result.meetingId;
        startSSEConnection();
        console.log('[Leader] Auto-reconnecting to:', meetingId);
      }
    });
  }

  // ポップアップからの操作を受ける
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === 'START') {
      running = true;
      enableDynamicAttach();
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'running…' });
      sendResponse && sendResponse({});
      return true;
    }
    if (msg.cmd === 'STOP') {
      stopAll();
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'stopped' });
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
          console.log('[Leader] API URL updated:', API_BASE_URL);
        }

        console.log('[Leader] Connecting with meeting ID:', meetingId);

        disconnectSSE();
        startSSEConnection();

        console.log('[Leader] Connection initiated successfully');
        sendResponse({ success: true, message: 'Connected' });
      } catch (error) {
        console.error('[Leader] Connection failed:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    } else if (msg.action === 'disconnect') {
      try {
        console.log('[Leader] Disconnecting...');
        disconnectSSE();
        sendResponse({ success: true, message: 'Disconnected' });
      } catch (error) {
        console.error('[Leader] Disconnect failed:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    } else if (msg.action === 'show_rest_overlay') {
      try {
        console.log('[Leader] Showing rest overlay from popup');
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
  });

  console.log('[Leader] Content script loaded');
})();