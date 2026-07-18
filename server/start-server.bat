@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 启动邀群密聊 WebSocket 中继 (0.0.0.0:8765)...
echo 手机请连接: ws://本机局域网IP:8765
python -m pip install -r requirements.txt -q
python server.py
pause
