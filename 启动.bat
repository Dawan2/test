@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   虎鲸漫剧 · 本地后端启动中
echo   讲好每一个故事!
echo ============================================
start "" http://localhost:8000
node server.js
pause
