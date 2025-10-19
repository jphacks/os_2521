(async () => {
  const apiUrlInput = document.getElementById('api-url-input');
  const meetingIdInput = document.getElementById('meeting-id-input');
  const urlHint = document.getElementById('url-hint');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusElement = document.querySelector('.status');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const requestRestBtn = document.getElementById('request-rest-btn');

  // config.jsから読み込んだ設定（存在する場合）
  const RAILWAY_URL = window.MEETING_REST_CONFIG
    ? window.MEETING_REST_CONFIG.DEFAULT_API_URL
    : 'https://pure-elegance-production.up.railway.app';

  // プリセット状態を保存
  function saveUrlPreset(type) {
    chrome.storage.local.set({ urlPreset: type });
  }

  // URL プリセット設定
  function setUrlPreset(type, button) {
    const buttons = document.querySelectorAll('.btn-preset');

    // すべてのボタンからactiveクラスを削除
    buttons.forEach(btn => btn.classList.remove('active'));

    // クリックされたボタンにactiveクラスを追加
    button.classList.add('active');

    switch(type) {
      case 'local':
        apiUrlInput.value = 'http://localhost:8000';
        apiUrlInput.readOnly = true;
        apiUrlInput.style.background = '#f5f5f5';
        break;
      case 'railway':
        apiUrlInput.value = RAILWAY_URL;
        apiUrlInput.readOnly = true;
        apiUrlInput.style.background = '#f5f5f5';
        break;
      case 'custom':
        apiUrlInput.readOnly = false;
        apiUrlInput.style.background = 'white';
        apiUrlInput.focus();
        break;
    }

    // 変更を保存
    saveUrlPreset(type);
    chrome.storage.local.set({ apiUrl: apiUrlInput.value.trim() });
  }

  // プリセットボタンにイベントリスナーを設定
  document.querySelectorAll('.btn-preset').forEach(button => {
    button.addEventListener('click', function() {
      const type = this.getAttribute('data-preset');
      setUrlPreset(type, this);
    });
  });

  // 現在のタブを取得
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // URLからMeeting IDを抽出
  function extractMeetingId(url) {
    if (!url) return null;
    const match = url.match(/meet\.google\.com\/([a-z0-9\-]+)/);
    return match ? match[1] : null;
  }

  // ステータスを更新
  function updateStatus(status, text) {
    // ドットのクラスを更新
    statusDot.className = 'status__indicator';
    if (status) {
      statusDot.classList.add(status);
    }

    // テキストを更新
    statusText.textContent = text;

    // ステータス背景色を更新
    statusElement.className = 'status';
    if (status) {
      statusElement.classList.add(status);
    }
  }

  // 初期化
  async function init() {
    const tab = await getCurrentTab();

    // URLからMeeting IDを取得
    const meetingId = extractMeetingId(tab?.url);
    if (meetingId) {
      meetingIdInput.value = meetingId;
      urlHint.textContent = `URLから自動取得: ${meetingId}`;
    } else {
      urlHint.textContent = 'URLから自動取得: なし';
    }

    // ストレージから接続状態とAPI URLを取得
    chrome.storage.local.get(['meetingId', 'isConnected', 'apiUrl', 'urlPreset'], (result) => {
      const savedPreset = result.urlPreset || 'custom';

      // API URLを復元（保存されていない場合はconfig.jsから取得）
      if (result.apiUrl) {
        apiUrlInput.value = result.apiUrl;
      } else if (window.MEETING_REST_CONFIG) {
        // config.jsの設定を使用
        apiUrlInput.value = window.MEETING_REST_CONFIG.DEFAULT_API_URL;
        chrome.storage.local.set({ apiUrl: window.MEETING_REST_CONFIG.DEFAULT_API_URL });
      }

      // プリセットボタンの状態を復元
      const buttons = document.querySelectorAll('.btn-preset');
      buttons.forEach(btn => {
        const btnId = btn.id;
        if ((btnId === 'btn-local' && savedPreset === 'local') ||
            (btnId === 'btn-railway' && savedPreset === 'railway') ||
            (btnId === 'btn-custom' && savedPreset === 'custom')) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // readonlyの状態を復元
      if (savedPreset !== 'custom') {
        apiUrlInput.readOnly = true;
        apiUrlInput.style.background = '#f5f5f5';
      }

      // 接続状態を復元
      if (result.isConnected && result.meetingId) {
        meetingIdInput.value = result.meetingId;
        updateStatus('connected', '接続済み ✓');
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
        requestRestBtn.disabled = false;
      } else {
        updateStatus('', '未接続');
        requestRestBtn.disabled = true;
      }
    });
  }

  // API URL変更時にストレージに保存
  apiUrlInput.addEventListener('input', () => {
    const apiUrl = apiUrlInput.value.trim();
    chrome.storage.local.set({ apiUrl: apiUrl });
  });

  // 接続ボタン
  connectBtn.addEventListener('click', async () => {
    const meetingId = meetingIdInput.value.trim();
    const apiUrl = apiUrlInput.value.trim();

    if (!meetingId) {
      alert('Meeting IDを入力してください');
      return;
    }

    if (!apiUrl) {
      alert('API URLを入力してください');
      return;
    }

    updateStatus('connecting', '接続中...');
    connectBtn.disabled = true;

    try {
      const tab = await getCurrentTab();

      // Google Meetのページかチェック
      if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
        throw new Error('Google Meetのページで実行してください');
      }

      console.log('[Popup] Sending connect message to content script:', meetingId, apiUrl);

      // Content scriptにメッセージを送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'connect',
        meetingId: meetingId,
        apiUrl: apiUrl
      });

      console.log('[Popup] Response from content script:', response);

      // ストレージに保存
      chrome.storage.local.set({
        meetingId: meetingId,
        apiUrl: apiUrl,
        isConnected: true
      });

      updateStatus('connected', '接続済み ✓');
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = 'block';
      requestRestBtn.disabled = false;
    } catch (error) {
      console.error('[Popup] Connection error:', error);
      updateStatus('error', error.message || '接続エラー');

      let errorMsg = '接続に失敗しました。\n\n';

      if (error.message && error.message.includes('meet.google.com')) {
        errorMsg += '現在のタブがGoogle Meetではありません。\nGoogle Meetのページを開いてから再度お試しください。';
      } else if (error.message && error.message.includes('Receiving end does not exist')) {
        errorMsg += 'Content scriptが読み込まれていません。\n\n対処法：\n1. ページをリロード（F5）\n2. 拡張機能を再読み込み';
      } else {
        errorMsg += 'エラー: ' + (error.message || '不明なエラー') + '\n\nブラウザのコンソール（F12）でエラーを確認してください。';
      }

      alert(errorMsg);
    } finally {
      connectBtn.disabled = false;
    }
  });

  // 切断ボタン
  disconnectBtn.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();

      // Content scriptにメッセージを送信
      await chrome.tabs.sendMessage(tab.id, {
        action: 'disconnect'
      });

      // ストレージをクリア
      chrome.storage.local.remove(['meetingId', 'isConnected']);

      updateStatus('', '未接続');
      connectBtn.style.display = 'block';
      disconnectBtn.style.display = 'none';
      requestRestBtn.disabled = true;
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });

  // 休憩希望ボタン
  requestRestBtn.addEventListener('click', async () => {
    const meetingId = meetingIdInput.value.trim();
    const apiUrl = apiUrlInput.value.trim();

    if (!meetingId || !apiUrl) {
      alert('接続してから休憩希望を送信してください');
      return;
    }

    requestRestBtn.disabled = true;

    try {
      const response = await fetch(`${apiUrl}/api/meetings/${meetingId}/rest-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('休憩希望の送信に失敗しました');
      }

      const data = await response.json();
      console.log('[Popup] Rest request sent:', data);

      // Content scriptに休憩オーバーレイ表示を指示
      try {
        const tab = await getCurrentTab();

        // Google Meetのページかチェック
        if (tab && tab.url && tab.url.includes('meet.google.com')) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'show_rest_overlay',
            data: {
              event: 'rest_required',
              meeting_id: meetingId,
              timestamp: data.timestamp,
              message: '休憩時間です（あなたからのリクエスト）'
            }
          });
          console.log('[Popup] Rest overlay displayed for requester');
        } else {
          console.log('[Popup] Not on Google Meet page, skipping overlay display');
        }
      } catch (overlayError) {
        // Content scriptへのメッセージ送信が失敗しても続行
        console.warn('[Popup] Failed to display rest overlay:', overlayError);
      }

      // 3秒後にボタンを再度有効化
      setTimeout(() => {
        requestRestBtn.disabled = false;
      }, 3000);
    } catch (error) {
      console.error('[Popup] Rest request error:', error);
      alert('休憩希望の送信に失敗しました: ' + error.message);
      requestRestBtn.disabled = false;
    }
  });

  // Content scriptからのステータス更新を監視
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'status_update') {
      updateStatus(message.status, message.text);
    }
  });

  // 初期化実行
  init();
})();
