@echo off
setlocal EnableExtensions

set "REPO=C:\Users\30363\OneDrive\Desktop\code\ai"
set "MSG=%~1"
if "%MSG%"=="" set "MSG=chore: update"

echo [1/3] git add -A
git -C "%REPO%" add -A
if errorlevel 1 goto :fail

echo [2/3] git commit -m "%MSG%"
git -C "%REPO%" commit -m "%MSG%"
if errorlevel 1 (
  echo No new commit created ^(maybe no file changes^). Continue to push...
)

echo [3/3] git push origin main
git -C "%REPO%" push origin main
if errorlevel 1 goto :fail

echo.
echo Push completed successfully.
pause
exit /b 0

:fail
echo.
echo Push failed. Please check the error above.
pause
exit /b 1
