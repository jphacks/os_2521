(async () => {
  // ビデオキャプチャ関連
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  const grid = document.getElementById('grid');
  const statusEl = document.getElementById('status');

  // 休憩通知システム関連
  const apiUrlInput = document.getElementById('api-url-input');
  const meetingIdInput = document.getElementById('meeting-id-input');
  const urlHint = document.getElementById('url-hint');
  const restStatusDot = document.getElementById('rest-status-dot');
  const restStatusText = document.getElementById('rest-status-text');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');

  // アクティブなタブ（Meet想定）を取得
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function ensureCell(idx) {
    let cell = document.querySelector(`[data-idx="${idx}"]`);
    if (!cell) {
      cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = idx;
      const img = document.createElement('img');
      img.alt = `#${idx}`;
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = `#${idx}`;
      cell.appendChild(img);
      cell.appendChild(cap);
      grid.appendChild(cell);
    }
    return cell;
  }

  // Start: Meetタブのcontent scriptへ開始メッセージ
  startBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!/^https:\/\/meet\.google\.com/.test(tab.url || '')) {
      statusEl.textContent = 'このタブはGoogle Meetではありません';
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { cmd: 'START' });
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'starting…';
  });

  // Stop
  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { cmd: 'STOP' });
    startBtn.disabled = false;
    stopBtn.disabled = true;
    grid.innerHTML = '';
    statusEl.textContent = 'stopped';
  });

  // content.js → popup へのフレーム/情報受信
  chrome.runtime.onMessage.addListener((msg, sender) => {
    // ほかのタブからのメッセージは無視
    // （ポップアップはアクティブタブだけを監視する想定）
    if (!sender.tab || !sender.tab.active) return;

    if (msg.type === 'VIDEOS_COUNT') {
      statusEl.textContent = `videos: ${msg.count}`;
    } else if (msg.type === 'FRAME') {
      const cell = ensureCell(msg.index);
      const img = cell.querySelector('img');
      const cap = cell.querySelector('.cap');
      img.src = msg.dataUrl;  // サムネ（更新）
      cap.textContent = `#${msg.index} ${msg.w}x${msg.h}`;
    } else if (msg.type === 'STATUS') {
      statusEl.textContent = msg.text;
    } else if (msg.type === 'status_update') {
      // 休憩通知システムのステータス更新
      updateRestStatus(msg.status, msg.text);
    }
  });

  // 休憩通知システム関連の処理

  /**
   * URLからMeeting IDを抽出
   */
  async function extractMeetingId() {
    try {
      const tab = await getActiveTab();
      const url = tab.url;

      if (!url || !/^https:\/\/meet\.google\.com/.test(url)) {
        urlHint.textContent = 'Google Meetのページではありません';
        urlHint.style.color = '#f44336';
        return null;
      }

      // Google MeetのURL形式: https://meet.google.com/abc-defg-hij
      const match = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
      if (match && match[1]) {
        const meetingId = match[1];
        meetingIdInput.value = meetingId;
        urlHint.textContent = `URLから自動取得: ${meetingId}`;
        urlHint.style.color = '#4caf50';
        return meetingId;
      } else {
        urlHint.textContent = 'Meeting IDが見つかりません';
        urlHint.style.color = '#ffc107';
        return null;
      }
    } catch (error) {
      console.error('[Popup] Failed to extract meeting ID:', error);
      urlHint.textContent = '取得エラー';
      urlHint.style.color = '#f44336';
      return null;
    }
  }

  /**
   * 休憩通知システムのステータスを更新
   */
  function updateRestStatus(status, text) {
    restStatusDot.className = 'indicator-dot';
    if (status) {
      restStatusDot.classList.add(status);
    }
    restStatusText.textContent = text;

    // ボタンの表示/非表示を切り替え
    if (status === 'connected') {
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = 'block';
    } else {
      connectBtn.style.display = 'block';
      disconnectBtn.style.display = 'none';
    }
  }

  /**
   * 接続開始
   */
  connectBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    const apiUrl = apiUrlInput.value.trim();
    const meetingId = meetingIdInput.value.trim();

    if (!apiUrl) {
      alert('API URLを入力してください');
      return;
    }

    if (!meetingId) {
      alert('Meeting IDを入力してください');
      return;
    }

    if (!/^https:\/\/meet\.google\.com/.test(tab.url || '')) {
      alert('このタブはGoogle Meetではありません');
      return;
    }

    console.log('[Popup] Connecting to:', { apiUrl, meetingId });

    try {
      // Content scriptに接続メッセージを送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'connect',
        apiUrl: apiUrl,
        meetingId: meetingId
      });

      console.log('[Popup] Connection response:', response);

      if (response && response.success) {
        // ストレージに保存
        await chrome.storage.local.set({
          apiUrl: apiUrl,
          meetingId: meetingId,
          isConnected: true
        });

        updateRestStatus('connecting', '接続中...');
      } else {
        alert('接続に失敗しました: ' + (response?.error || 'Unknown error'));
        updateRestStatus('error', '接続エラー');
      }
    } catch (error) {
      console.error('[Popup] Connection error:', error);
      alert('接続エラー: ' + error.message);
      updateRestStatus('error', '接続エラー');
    }
  });

  /**
   * 切断
   */
  disconnectBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'disconnect'
      });

      console.log('[Popup] Disconnect response:', response);

      if (response && response.success) {
        // ストレージから削除
        await chrome.storage.local.set({
          isConnected: false
        });

        updateRestStatus('', '未接続');
      } else {
        alert('切断に失敗しました: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[Popup] Disconnect error:', error);
      alert('切断エラー: ' + error.message);
    }
  });

  /**
   * ストレージから設定を復元
   */
  async function restoreSettings() {
    try {
      const result = await chrome.storage.local.get(['apiUrl', 'meetingId', 'isConnected']);

      if (result.apiUrl) {
        apiUrlInput.value = result.apiUrl;
      }

      if (result.meetingId) {
        meetingIdInput.value = result.meetingId;
      }

      if (result.isConnected) {
        updateRestStatus('connected', '接続済み ✓');
      }
    } catch (error) {
      console.error('[Popup] Failed to restore settings:', error);
    }
  }

  // 初期化
  async function init() {
    // 設定を復元
    await restoreSettings();

    // Meeting IDを自動抽出
    await extractMeetingId();
  }

  // ページ読み込み時に初期化
  init();
})();