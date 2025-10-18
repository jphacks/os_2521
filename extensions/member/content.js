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
        } else if (data.event === 'rest_request_updated') {
          showRestRequestNotification(data);
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
  function showRestOverlay(data) {
    // 既にオーバーレイが表示されている場合はスキップ
    if (overlayElement && document.body.contains(overlayElement)) {
      console.log('[Member] Overlay already shown');
      return;
    }

    console.log('[Member] Showing rest overlay - BLOCKING MODE');

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

    console.log('[Member] Hiding rest overlay');

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
      console.warn('[Member] Failed to play notification sound:', error);
    }
  }

  /**
   * 休憩希望通知を表示（小さなトースト通知）
   */
  function showRestRequestNotification(data) {
    console.log('[Member] Showing rest request notification:', data);

    // ポップアップに通知を送る
    chrome.runtime.sendMessage({
      type: 'rest_request_updated',
      message: data.message,
      request_count: data.request_count
    }).catch(() => {
      // ポップアップが開いていない場合はエラーを無視
    });

    // ページ内にもトースト通知を表示
    const toastElement = document.createElement('div');
    toastElement.id = 'meeting-rest-request-toast';
    toastElement.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        z-index: 2147483646;
        font-family: 'Google Sans', 'Roboto', sans-serif;
        font-size: 14px;
        font-weight: 600;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 24px;">💤</div>
          <div>${data.message || '誰かが休憩を希望しています'}</div>
        </div>
      </div>
    `;

    // アニメーション用のスタイルを追加
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toastElement);

    // 5秒後に自動的に非表示
    setTimeout(() => {
      toastElement.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (document.body.contains(toastElement)) {
          document.body.removeChild(toastElement);
        }
      }, 300);
    }, 5000);
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
