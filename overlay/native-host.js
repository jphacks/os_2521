#!/usr/bin/env node

/**
 * Native Messaging Host
 * Chrome拡張機能とElectronアプリ間のブリッジ
 */

const net = require('net');
const path = require('path');

// Electronアプリとの通信用TCP設定
const ELECTRON_PORT = 9876;
const ELECTRON_HOST = '127.0.0.1';

let electronClient = null;

/**
 * Electronアプリに接続
 */
function connectToElectron() {
  electronClient = new net.Socket();

  electronClient.connect(ELECTRON_PORT, ELECTRON_HOST, () => {
    writeLog('Connected to Electron app');
  });

  electronClient.on('error', (err) => {
    writeLog(`Electron connection error: ${err.message}`);
    electronClient = null;
  });

  electronClient.on('close', () => {
    writeLog('Electron connection closed');
    electronClient = null;
  });
}

/**
 * Chrome拡張機能からのメッセージを読み取る
 */
function readMessage() {
  const header = Buffer.alloc(4);
  let bytesRead = 0;

  // ヘッダー(4バイト)を読み取る
  while (bytesRead < 4) {
    const chunk = process.stdin.read(4 - bytesRead);
    if (chunk === null) {
      return null;
    }
    chunk.copy(header, bytesRead);
    bytesRead += chunk.length;
  }

  const messageLength = header.readUInt32LE(0);

  // メッセージ本体を読み取る
  const messageBuffer = Buffer.alloc(messageLength);
  bytesRead = 0;

  while (bytesRead < messageLength) {
    const chunk = process.stdin.read(messageLength - bytesRead);
    if (chunk === null) {
      return null;
    }
    chunk.copy(messageBuffer, bytesRead);
    bytesRead += chunk.length;
  }

  const message = messageBuffer.toString('utf8');
  return JSON.parse(message);
}

/**
 * Chrome拡張機能にメッセージを送信
 */
function sendMessage(message) {
  const messageString = JSON.stringify(message);
  const messageBuffer = Buffer.from(messageString, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(messageBuffer.length, 0);

  process.stdout.write(header);
  process.stdout.write(messageBuffer);
}

/**
 * ログを出力（デバッグ用）
 */
function writeLog(message) {
  const fs = require('fs');
  const logPath = path.join(__dirname, 'native-host.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

/**
 * メインループ
 */
function main() {
  writeLog('Native messaging host started');

  // Electronアプリに接続
  connectToElectron();

  // 標準入力からメッセージを読み取る
  process.stdin.on('readable', () => {
    let message;
    try {
      message = readMessage();
      if (message === null) {
        return;
      }

      writeLog(`Received from extension: ${JSON.stringify(message)}`);

      // Electronアプリにメッセージを転送
      if (electronClient && !electronClient.destroyed) {
        const dataToSend = JSON.stringify(message) + '\n';
        electronClient.write(dataToSend);
        writeLog('Forwarded to Electron');

        // 拡張機能に成功を返す
        sendMessage({ success: true, message: 'Data sent to overlay' });
      } else {
        writeLog('Electron not connected, attempting to reconnect...');
        connectToElectron();

        // 拡張機能にエラーを返す
        sendMessage({ success: false, error: 'Overlay not connected' });
      }
    } catch (error) {
      writeLog(`Error processing message: ${error.message}`);
      sendMessage({ success: false, error: error.message });
    }
  });

  process.stdin.on('end', () => {
    writeLog('stdin ended');
    if (electronClient) {
      electronClient.destroy();
    }
    process.exit(0);
  });
}

// エラーハンドリング
process.on('uncaughtException', (error) => {
  writeLog(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  writeLog('SIGTERM received');
  if (electronClient) {
    electronClient.destroy();
  }
  process.exit(0);
});

// 起動
main();
