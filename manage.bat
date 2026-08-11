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
for /f "delims=" %%L in ('powershell.exe -NoProfile -Command "$l=$env:MCODEX_LOCALE; if (-not $l) {$l=[Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName}; if ($l -like 'en*') {'en'} else {'zh'}"') do set "MCODEX_LANG=%%L"
if /I "%MCODEX_LANG%"=="en" (
  echo Startup did not complete. Review the error above, then press any key to close.
) else (
  echo 启动未完成，请查看上面的错误信息，按任意键关闭。
)
pause >nul

:end
endlocal & exit /b %EXIT_CODE%
