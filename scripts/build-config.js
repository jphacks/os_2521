#!/usr/bin/env node

/**
 * .envファイルからconfig.jsを自動生成するスクリプト
 *
 * 使い方:
 *   node scripts/build-config.js
 */

const fs = require('fs');
const path = require('path');

// パス設定
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const configPath = path.join(rootDir, 'extensions', 'member', 'config.js');

console.log('[Build Config] Starting...');

// .envファイルを読み込む
if (!fs.existsSync(envPath)) {
  console.error('[Build Config] Error: .env file not found!');
  console.error('[Build Config] Please create .env file at project root.');
  console.error('[Build Config] Example: DEFAULT_API_URL=https://your-app.up.railway.app');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
console.log('[Build Config] .env file loaded');

// .envをパース
const envVars = {};
envContent.split('\n').forEach(line => {
  line = line.trim();

  // コメントと空行をスキップ
  if (!line || line.startsWith('#')) {
    return;
  }

  // KEY=VALUE または KEY = VALUE の形式をパース
  const match = line.match(/^([^=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();

    // 引用符を削除
    value = value.replace(/^["']|["']$/g, '');

    envVars[key] = value;
  }
});

// DEFAULT_API_URLを取得
const defaultApiUrl = envVars.DEFAULT_API_URL || envVars.BACKEND_ENDPOINT;
if (!defaultApiUrl) {
  console.error('[Build Config] Error: DEFAULT_API_URL or BACKEND_ENDPOINT not found in .env');
  process.exit(1);
}

console.log('[Build Config] API URL:', defaultApiUrl);

// config.jsを生成
const configContent = `// このファイルは自動生成されます
// 編集する場合は .env ファイルを変更して npm run build:config を実行してください

// API設定
const CONFIG = {
  DEFAULT_API_URL: '${defaultApiUrl}',
  FALLBACK_API_URL: 'http://localhost:8000'
};

// 設定をグローバルに公開
window.MEETING_REST_CONFIG = CONFIG;
`;

fs.writeFileSync(configPath, configContent, 'utf-8');
console.log('[Build Config] config.js generated successfully!');
console.log('[Build Config] Output:', configPath);
console.log('[Build Config] Done!');
