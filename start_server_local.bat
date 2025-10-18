@echo off
echo ======================================
echo Meeting Rest System - Local Server
echo ======================================
echo.

REM Python仮想環境のチェック
if not exist "server\venv" (
    echo Python仮想環境を作成中...
    cd server
    python -m venv venv
    cd ..
)

REM 仮想環境をアクティブ化
echo 仮想環境をアクティブ化...
call server\venv\Scripts\activate.bat

REM 依存関係をインストール
echo 依存関係をインストール中...
cd server
pip install -r requirements.txt

REM 環境変数を設定（ローカルRedisを使用）
set REDIS_HOST=localhost
set REDIS_PORT=6379

echo.
echo ======================================
echo サーバーを起動します...
echo URL: http://localhost:8000
echo Docs: http://localhost:8000/docs
echo ======================================
echo.
echo 注意: Redisが起動している必要があります
echo Redisをインストールしていない場合は、以下のURLから
echo Memurai（Windows用Redis）をダウンロードしてください：
echo https://www.memurai.com/get-memurai
echo.
echo サーバーを停止するには Ctrl+C を押してください
echo.

REM サーバー起動
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
