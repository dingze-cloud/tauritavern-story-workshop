@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 故事研讨助手 - 手机局域网安装
echo 请让手机与电脑连接同一个 Wi-Fi，保持此窗口打开。
echo 如果 Windows 防火墙询问，请仅允许你信任的专用网络。
echo 电脑需要已有 Python 3 和 Git；手机无需安装这些工具。
python serve-install.py --lan
pause
