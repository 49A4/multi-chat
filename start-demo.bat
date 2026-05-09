@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d %~dp0

set "PS1=%~dp0start-demo.ps1"
set "CMD_FALLBACK=%~dp0start-demo-cmd.bat"

if not defined FRONTEND_DEV_ARGS set "FRONTEND_DEV_ARGS=-- --host 0.0.0.0"
if not defined KEEP_LOG_WINDOW set "KEEP_LOG_WINDOW=0"

set "LAUNCHER="
where pwsh >nul 2>nul
if "%ERRORLEVEL%"=="0" set "LAUNCHER=pwsh"
if not defined LAUNCHER (
  if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    set "LAUNCHER=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
  )
)

if /I "%FORCE_CMD_LAUNCHER%"=="1" set "LAUNCHER="

if defined LAUNCHER if exist "%PS1%" (
  echo [Launcher] Trying PowerShell launcher: %LAUNCHER%
  "%LAUNCHER%" -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
  set "CODE=!ERRORLEVEL!"
  if "!CODE!"=="0" exit /b 0
  echo [WARN] PowerShell launcher failed with exit code !CODE!.
)

if not exist "%CMD_FALLBACK%" (
  echo [ERROR] No available launcher found.
  if not exist "%PS1%" echo [ERROR] Missing script: %PS1%
  if not exist "%CMD_FALLBACK%" echo [ERROR] Missing script: %CMD_FALLBACK%
  pause
  exit /b 1
)

echo [Launcher] Falling back to CMD launcher...
call "%CMD_FALLBACK%" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo [ERROR] CMD launcher failed with exit code %CODE%.
  pause
)
exit /b %CODE%
