/**
 * Background Service Worker
 * Native Messaging Hostとの通信を管理
 */

const NATIVE_HOST_NAME = 'com.meeting.rest.overlay';

let nativePort = null;

/**
 * Native Messaging Hostに接続
 */
function connectToNativeHost() {
  console.log('[Background] Connecting to native host:', NATIVE_HOST_NAME);

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      console.log('[Background] Received from native host:', message);
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('[Background] Native host disconnected');
      if (chrome.runtime.lastError) {
        console.error('[Background] Error:', chrome.runtime.lastError.message);
      }
      nativePort = null;
    });

    console.log('[Background] Connected to native host');
  } catch (error) {
    console.error('[Background] Failed to connect to native host:', error);
    nativePort = null;
  }
}

/**
 * Overlayにデータを送信
 */
function sendToOverlay(data) {
  if (!nativePort) {
    console.log('[Background] Not connected to native host, attempting connection...');
    connectToNativeHost();
  }

  if (nativePort) {
    try {
      nativePort.postMessage(data);
      console.log('[Background] Sent to overlay:', data);
      return true;
    } catch (error) {
      console.error('[Background] Failed to send to overlay:', error);
      return false;
    }
  } else {
    console.error('[Background] Native port not available');
    return false;
  }
}

/**
 * Content scriptからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message from content script:', message);

  if (message.action === 'send_to_overlay') {
    const success = sendToOverlay(message.data);
    sendResponse({ success: success });
    return true;
  }

  if (message.action === 'connect_overlay') {
    // Overlayに接続情報を送信
    const overlayData = {
      type: 'connect',
      meetingId: message.meetingId,
      apiBaseUrl: message.apiUrl
    };

    const success = sendToOverlay(overlayData);
    sendResponse({ success: success });
    return true;
  }

  return false;
});

// 起動時にnative hostに接続
connectToNativeHost();

console.log('[Background] Service worker initialized');
