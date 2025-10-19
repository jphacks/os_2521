(() => {
  // 設定（動的に変更可能）
  let API_BASE_URL = window.MEETING_REST_CONFIG
    ? window.MEETING_REST_CONFIG.DEFAULT_API_URL
    : 'http://localhost:8000';
  let eventSource = null;
  let meetingId = null;
  let overlayElement = null;
  let pageInfoInterval = null;

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
        console.log('[Member] Page info sent:', pageInfo);
      } else {
        console.error('[Member] Failed to send page info:', response.status);
      }
    } catch (error) {
      console.error('[Member] Error sending page info:', error);
    }
  }

  /**
   * ページ情報の定期送信を開始
   */
  function startPageInfoMonitoring() {
    if (pageInfoInterval) {
      console.log('[Member] Page info monitoring already started');
      return;
    }

    // 即座に1回送信
    sendPageInfo();

    // 5秒ごとに送信
    pageInfoInterval = setInterval(sendPageInfo, 5000);
    console.log('[Member] Started page info monitoring (every 5 seconds)');
  }

  /**
   * ページ情報の定期送信を停止
   */
  function stopPageInfoMonitoring() {
    if (pageInfoInterval) {
      clearInterval(pageInfoInterval);
      pageInfoInterval = null;
      console.log('[Member] Stopped page info monitoring');
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
      console.log('[Member] Disconnected from SSE');
    }
  }

  /**
   * Overlayに接続情報を送信
   */
  function sendConnectionToOverlay(meetingId, apiUrl) {
    chrome.runtime.sendMessage({
      action: 'connect_overlay',
      meetingId: meetingId,
      apiUrl: apiUrl
    }, (response) => {
      if (response && response.success) {
        console.log('[Member] Connection info sent to overlay');
      } else {
        console.error('[Member] Failed to send connection info to overlay');
      }
    });
  }

  /**
   * SSE接続を開始
   */
  function startSSEConnection() {
    if (eventSource) {
      console.log('[Member] SSE already connected');
      notifyStatus('connected', '接続済み ✓');
      return;
    }

    if (!meetingId) {
      console.error('[Member] No meeting_id provided');
      notifyStatus('error', 'Meeting IDが未設定');
      return;
    }

    // Overlayに接続情報を送信
    sendConnectionToOverlay(meetingId, API_BASE_URL);

    notifyStatus('connecting', '接続中...');

    const sseUrl = `${API_BASE_URL}/api/sse/events?meeting_id=${meetingId}`;
    console.log(`[Member] Connecting to SSE: ${sseUrl}`);

    eventSource = new EventSource(sseUrl);

    // 接続確立
    eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('[Member] SSE connected:', data);
      notifyStatus('connected', '接続済み ✓');

      // ページ情報の監視を開始
      startPageInfoMonitoring();
    });

    // 休憩通知イベント
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Member] SSE event received:', data);

        if (data.event === 'rest_required') {
          showRestOverlay(data);
        }
      } catch (error) {
        console.error('[Member] Failed to parse SSE message:', error);
      }
    });

    // ハートビート
    eventSource.addEventListener('heartbeat', (event) => {
      const data = JSON.parse(event.data);
      console.log('[Member] Heartbeat:', data.timestamp);
    });

    // エラーハンドリング
    eventSource.onerror = (error) => {
      console.error('[Member] SSE error:', error);
      notifyStatus('error', '接続エラー');

      // 接続が切れた場合は再接続を試みる
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[Member] SSE connection closed. Reconnecting in 5 seconds...');
        eventSource = null;
        notifyStatus('connecting', '再接続中... (5秒後)');
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
        background: rgba(0,0,0,0.3); /* 画面を少し暗く透過 */
        pointer-events: all;
        user-select: none;
        backdrop-filter: blur(4px); /* ここを追加 */
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
  }

  /**
   * 休憩オーバーレイUIを非表示
   */
  function hideRestOverlay() {
    if (!overlayElement) return;
    document.body.classList.remove('rest-overlay-active');
    if (overlayElement && document.body.contains(overlayElement)) {
      document.body.removeChild(overlayElement);
      overlayElement = null;
    }
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
      console.warn('[Member] Failed to play notification sound:', error);
    }
  }

  /**
   * ページ読み込み完了後に初期化
   */
  function init() {
    console.log('[Member] Member Extension initialized');
    console.log('[Member] Click the extension icon to connect.');

    // ストレージから接続状態とAPI URLを復元
    chrome.storage.local.get(['meetingId', 'apiUrl', 'isConnected'], (result) => {
      if (result.apiUrl) {
        API_BASE_URL = result.apiUrl;
        console.log('[Member] API URL loaded:', API_BASE_URL);
      }

      if (result.isConnected && result.meetingId) {
        meetingId = result.meetingId;
        startSSEConnection();
        console.log('[Member] Auto-reconnecting to:', meetingId);
      }
    });
  }

  /**
   * ポップアップからのメッセージを受信
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Member Content] Received message:', message);

    if (message.action === 'connect') {
      try {
        meetingId = message.meetingId;

        // API URLが指定されていれば更新
        if (message.apiUrl) {
          API_BASE_URL = message.apiUrl;
          console.log('[Member Content] API URL updated:', API_BASE_URL);
        }

        console.log('[Member Content] Connecting with meeting ID:', meetingId);

        disconnectSSE();
        startSSEConnection();

        console.log('[Member Content] Connection initiated successfully');
        sendResponse({ success: true, message: 'Connected' });
      } catch (error) {
        console.error('[Member Content] Connection failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === 'disconnect') {
      try {
        console.log('[Member Content] Disconnecting...');
        disconnectSSE();
        sendResponse({ success: true, message: 'Disconnected' });
      } catch (error) {
        console.error('[Member Content] Disconnect failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === 'show_rest_overlay') {
      try {
        console.log('[Member Content] Showing rest overlay from popup');
        showRestOverlay(message.data);
        sendResponse({ success: true, message: 'Rest overlay displayed' });
      } catch (error) {
        console.error('[Member Content] Failed to show rest overlay:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
    return true;
  });

  // ページ読み込み完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ページ遷移時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  });

  console.log('[Member] Content script loaded');
})();
