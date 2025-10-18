const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const { io } = require('socket.io-client');

let overlayWindow = null;
let socket = null;
let tcpServer = null;

// API設定（環境変数または既定値）
// Chrome拡張機能から受信した値で上書き可能
let API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
let MEETING_ID = process.env.MEETING_ID || 'default-meeting';

// 拡張機能から接続情報を受信したかどうか
let receivedConnectionInfo = false;

/**
 * オーバーレイウィンドウを作成
 */
function createOverlayWindow() {
  // プライマリディスプレイのサイズを取得
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // クリックスルーを有効にする（ウィンドウを透明にしてマウスイベントを通過させる）
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // オーバーレイHTMLを読み込み
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  // 開発者ツールを開く（デバッグ用、本番では削除）
  // overlayWindow.webContents.openDevTools({ mode: 'detach' });

  console.log('✓ Overlay window created');
}

/**
 * TCPサーバーを起動（Native Messaging Hostからの接続を受け付ける）
 */
function startTCPServer() {
  const TCP_PORT = 9876;

  tcpServer = net.createServer((socket) => {
    console.log('✓ Native host connected');

    socket.on('data', (data) => {
      try {
        const messages = data.toString().split('\n').filter(msg => msg.trim());

        messages.forEach(msg => {
          const message = JSON.parse(msg);
          console.log('Received from native host:', message);

          // 接続情報を受信
          if (message.type === 'connect') {
            receivedConnectionInfo = true;
            MEETING_ID = message.meetingId;
            API_BASE_URL = message.apiBaseUrl;

            console.log(`✓ Updated connection info - Meeting ID: ${MEETING_ID}, API: ${API_BASE_URL}`);

            // WebSocket接続を再構築
            if (socket) {
              socket.disconnect();
            }
            startWebSocketConnection();
          }
        });
      } catch (error) {
        console.error('Error parsing message from native host:', error);
      }
    });

    socket.on('error', (error) => {
      console.error('TCP socket error:', error);
    });

    socket.on('close', () => {
      console.log('Native host disconnected');
    });
  });

  tcpServer.listen(TCP_PORT, '127.0.0.1', () => {
    console.log(`✓ TCP server listening on port ${TCP_PORT}`);
  });

  tcpServer.on('error', (error) => {
    console.error('TCP server error:', error);
  });
}

/**
 * WebSocket接続を開始
 */
function startWebSocketConnection() {
  const wsUrl = `${API_BASE_URL}`;
  console.log(`Connecting to WebSocket: ${wsUrl}`);

  socket = io(wsUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  socket.on('connect', () => {
    console.log('✓ WebSocket connected');
    // 会議IDで接続
    socket.emit('join_meeting', { meeting_id: MEETING_ID });
  });

  socket.on('disconnect', () => {
    console.log('✗ WebSocket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('✗ WebSocket connection error:', error.message);
  });

  // ページ情報を受信
  socket.on('page_info', (data) => {
    console.log('Received page info:', data);
    if (overlayWindow) {
      overlayWindow.webContents.send('update-page-info', data);
    }
  });

  // 休憩通知を受信
  socket.on('rest_required', (data) => {
    console.log('Received rest notification:', data);
    if (overlayWindow) {
      overlayWindow.webContents.send('show-rest-notification', data);
    }
  });
}

/**
 * アプリケーション起動時
 */
app.whenReady().then(() => {
  createOverlayWindow();
  startTCPServer();

  // 環境変数で設定されている場合のみ自動接続
  if (process.env.API_BASE_URL || process.env.MEETING_ID) {
    console.log('Using environment variables for connection');
    startWebSocketConnection();
  } else {
    console.log('Waiting for connection info from Chrome extension...');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

/**
 * すべてのウィンドウが閉じられたとき
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (socket) {
      socket.disconnect();
    }
    app.quit();
  }
});

/**
 * アプリケーション終了時
 */
app.on('will-quit', () => {
  if (socket) {
    socket.disconnect();
  }
  if (tcpServer) {
    tcpServer.close();
  }
});

/**
 * レンダラープロセスからのメッセージ処理
 */
ipcMain.on('hide-notification', () => {
  console.log('Hide notification requested');
  if (overlayWindow) {
    overlayWindow.webContents.send('hide-rest-notification');
  }
});
