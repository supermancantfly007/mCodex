@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\manage.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%~1"=="" goto end
if "%EXIT_CODE%"=="0" (
  exit /b 0
)

echo.
echo 启动未完成，请查看上面的错误信息，按任意键关闭。
pause >nul

:end
endlocal & exit /b %EXIT_CODE%
