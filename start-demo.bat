@echo off
setlocal EnableExtensions
cd /d %~dp0

set "PS1=%~dp0start-demo.ps1"
if not exist "%PS1%" (
  echo [ERROR] Script not found: %PS1%
  pause
  exit /b 1
)

echo [Launcher] Delegating startup to start-demo.ps1 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo [ERROR] start-demo.ps1 failed with exit code %CODE%.
  echo Try:
  echo   powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
  pause
)
exit /b %CODE%
