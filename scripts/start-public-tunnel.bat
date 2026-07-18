@echo off
chcp 65001 >nul
echo.
echo  === 手机流量用：Cloudflare 临时公网隧道 ===
echo.
echo  1) 请先在另一个窗口启动中继:
echo       cd server
echo       python server.py
echo.
echo  2) 本脚本会把本机 8765 暴露为 https/wss 临时域名
echo  3) 把打印的 https://xxxx.trycloudflare.com
echo     改成 wss://xxxx.trycloudflare.com
echo     填进 App「设置 → 邀请用公网地址」
echo.
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 cloudflared
  echo 请安装: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo 或: winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)
echo 启动隧道中... 保持本窗口不关
echo.
cloudflared tunnel --url http://127.0.0.1:8765
pause
