@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\启动PulseLog.ps1" -LocalOnly %*
if errorlevel 1 (
    echo.
    echo PulseLog failed to start. See the message above.
    pause
    exit /b 1
)
