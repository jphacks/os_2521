/**
 * Native Messaging Hostのインストールスクリプト
 * Chrome拡張機能がネイティブホストと通信できるようにレジストリに登録
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NATIVE_HOST_NAME = 'com.meeting.rest.overlay';
const isWindows = process.platform === 'win32';

function installNativeHost() {
  const projectRoot = path.resolve(__dirname, '..');
  const nativeHostPath = path.join(projectRoot, 'overlay', 'native-host.js');

  // Native Messaging Host マニフェストを作成
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Meeting Rest Overlay Native Host',
    path: nativeHostPath,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://YOUR_EXTENSION_ID/' // インストール後に更新が必要
    ]
  };

  const manifestPath = path.join(projectRoot, 'overlay', `${NATIVE_HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('✓ Native host manifest created:', manifestPath);

  if (isWindows) {
    // Windowsのレジストリに登録
    const registryKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;
    const regCommand = `REG ADD "${registryKey}" /ve /t REG_SZ /d "${manifestPath}" /f`;

    try {
      execSync(regCommand, { stdio: 'inherit' });
      console.log('✓ Native host registered in Windows registry');
      console.log('  Registry key:', registryKey);
    } catch (error) {
      console.error('✗ Failed to register native host:', error.message);
      process.exit(1);
    }
  } else if (process.platform === 'darwin') {
    // macOSの場合
    const targetDir = path.join(
      process.env.HOME,
      'Library/Application Support/Google/Chrome/NativeMessagingHosts'
    );
    const targetPath = path.join(targetDir, `${NATIVE_HOST_NAME}.json`);

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(manifestPath, targetPath);
    console.log('✓ Native host manifest copied to:', targetPath);
  } else {
    // Linuxの場合
    const targetDir = path.join(
      process.env.HOME,
      '.config/google-chrome/NativeMessagingHosts'
    );
    const targetPath = path.join(targetDir, `${NATIVE_HOST_NAME}.json`);

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(manifestPath, targetPath);
    console.log('✓ Native host manifest copied to:', targetPath);
  }

  console.log('\n次のステップ:');
  console.log('1. Chrome拡張機能を読み込んで、拡張機能IDを取得してください');
  console.log('2. 以下のファイルを編集して、YOUR_EXTENSION_IDを実際のIDに置き換えてください:');
  console.log(`   ${manifestPath}`);
  console.log('3. このスクリプトを再度実行してください');
}

// アンインストールスクリプト
function uninstallNativeHost() {
  if (isWindows) {
    const registryKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;
    const regCommand = `REG DELETE "${registryKey}" /f`;

    try {
      execSync(regCommand, { stdio: 'inherit' });
      console.log('✓ Native host unregistered from Windows registry');
    } catch (error) {
      console.error('✗ Failed to unregister native host:', error.message);
    }
  } else if (process.platform === 'darwin') {
    const targetPath = path.join(
      process.env.HOME,
      'Library/Application Support/Google/Chrome/NativeMessagingHosts',
      `${NATIVE_HOST_NAME}.json`
    );

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      console.log('✓ Native host manifest removed from:', targetPath);
    }
  } else {
    const targetPath = path.join(
      process.env.HOME,
      '.config/google-chrome/NativeMessagingHosts',
      `${NATIVE_HOST_NAME}.json`
    );

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      console.log('✓ Native host manifest removed from:', targetPath);
    }
  }
}

// コマンドライン引数を処理
const command = process.argv[2];

if (command === 'uninstall') {
  uninstallNativeHost();
} else {
  installNativeHost();
}
