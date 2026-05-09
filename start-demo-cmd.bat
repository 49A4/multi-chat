@echo off
setlocal EnableExtensions
cd /d %~dp0

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "RUN_DIR=%ROOT%\.run"
set "NPM_CACHE=%FRONTEND_DIR%\.npm-cache"
set "M2_REPO=C:\m2repo"

if not exist "%BACKEND_DIR%\pom.xml" (
  echo [ERROR] Backend directory is invalid: %BACKEND_DIR%
  exit /b 1
)
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Frontend directory is invalid: %FRONTEND_DIR%
  exit /b 1
)

if not defined FRONTEND_DEV_ARGS set "FRONTEND_DEV_ARGS=-- --host 0.0.0.0"

set "DEFAULT_JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
set "DEFAULT_MAVEN_HOME=C:\tools\apache-maven-3.9.14"

set "JAVA_HOME_EFFECTIVE="
if exist "%DEFAULT_JAVA_HOME%\bin\java.exe" (
  set "JAVA_HOME_EFFECTIVE=%DEFAULT_JAVA_HOME%"
) else if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" (
  set "JAVA_HOME_EFFECTIVE=%JAVA_HOME%"
)

if not defined JAVA_HOME_EFFECTIVE (
  echo [ERROR] Cannot find a valid JDK. Install JDK 17 or set JAVA_HOME.
  exit /b 1
)

set "MAVEN_HOME_EFFECTIVE=%DEFAULT_MAVEN_HOME%"
set "MVN_CMD=%MAVEN_HOME_EFFECTIVE%\bin\mvn.cmd"
if not exist "%MVN_CMD%" (
  set "MVN_CMD=mvn"
  where mvn >nul 2>nul || (
    echo [ERROR] Cannot find Maven. Install Maven or put mvn in PATH.
    exit /b 1
  )
)

where npm >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  echo [ERROR] npm not found in PATH.
  exit /b 1
)

if not exist "%RUN_DIR%" mkdir "%RUN_DIR%" >nul 2>nul
if not exist "%M2_REPO%" mkdir "%M2_REPO%" >nul 2>nul

if /I "%~1"=="--check" (
  echo [CHECK] Environment looks good for CMD launcher.
  exit /b 0
)

call :KillPort 8080
call :KillPort 5173

echo [1/3] Starting backend on http://localhost:8080 ...
start "multi-chat backend" cmd /k "cd /d ""%BACKEND_DIR%"" && set ""JAVA_HOME=%JAVA_HOME_EFFECTIVE%"" && set ""MAVEN_HOME=%MAVEN_HOME_EFFECTIVE%"" && set ""Path=%MAVEN_HOME_EFFECTIVE%\bin;%JAVA_HOME_EFFECTIVE%\bin;%Path%"" && ""%MVN_CMD%"" -s settings-local.xml spring-boot:run"

echo [2/3] Starting frontend on http://localhost:5173 (LAN exposed) ...
start "multi-chat frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && set ""npm_config_cache=%NPM_CACHE%"" && if exist node_modules (npm run dev %FRONTEND_DEV_ARGS%) else (npm install --cache .npm-cache && npm run dev %FRONTEND_DEV_ARGS%)"

echo [3/3] Done. Two windows were opened.
exit /b 0

:KillPort
set "TARGET_PORT=%~1"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
  if not "%%P"=="4" (
    echo [cleanup] Stopping process %%P on port %TARGET_PORT% ...
    taskkill /PID %%P /T /F >nul 2>nul
  )
)
exit /b 0
