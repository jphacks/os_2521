// DOM要素
const pageInfoContainer = document.getElementById('page-info-container');
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const meetingId = document.getElementById('meeting-id');
const pageTimestamp = document.getElementById('page-timestamp');
const restNotification = document.getElementById('rest-notification');
const restMessage = document.getElementById('rest-message');
const restOkBtn = document.getElementById('rest-ok-btn');
const restRequestToast = document.getElementById('rest-request-toast');
const restRequestMessage = document.getElementById('rest-request-message');

/**
 * ページ情報を更新
 */
window.electronAPI.onUpdatePageInfo((data) => {
  console.log('Updating page info:', data);

  pageTitle.textContent = data.title || '-';
  pageUrl.textContent = data.url || '-';
  meetingId.textContent = data.meeting_id || '-';

  const timestamp = new Date(data.timestamp);
  pageTimestamp.textContent = `更新: ${timestamp.toLocaleTimeString('ja-JP')}`;

  // コンテナを表示
  pageInfoContainer.classList.add('visible');

  // 5秒後に自動的に隠す（オプション）
  // setTimeout(() => {
  //   pageInfoContainer.classList.remove('visible');
  // }, 5000);
});

/**
 * 休憩通知を表示
 */
window.electronAPI.onShowRestNotification((data) => {
  console.log('Showing rest notification:', data);

  restMessage.textContent = data.message || '少し休憩して、リフレッシュしましょう';
  restNotification.classList.add('visible');

  // 通知音を再生
  playNotificationSound();
});

/**
 * 休憩通知を非表示
 */
window.electronAPI.onHideRestNotification(() => {
  console.log('Hiding rest notification');
  restNotification.classList.remove('visible');
});

/**
 * OKボタンクリック
 */
restOkBtn.addEventListener('click', () => {
  console.log('OK button clicked');
  restNotification.classList.remove('visible');
  window.electronAPI.hideNotification();
});

/**
 * 通知音を再生
 */
function playNotificationSound() {
  try {
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
    console.warn('Failed to play notification sound:', error);
  }
}

/**
 * 休憩希望通知を表示
 */
window.electronAPI.onShowRestRequest = ((data) => {
  console.log('Showing rest request notification:', data);

  restRequestMessage.textContent = data.message || '誰かが休憩を希望しています';
  restRequestToast.classList.remove('hiding');
  restRequestToast.classList.add('visible');

  // 5秒後に自動的に非表示
  setTimeout(() => {
    restRequestToast.classList.remove('visible');
    restRequestToast.classList.add('hiding');
    setTimeout(() => {
      restRequestToast.classList.remove('hiding');
    }, 300);
  }, 5000);
});

console.log('Overlay renderer loaded');
