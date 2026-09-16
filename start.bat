@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 goto :error

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is missing. Install Node.js 24 or newer and try again.
  goto :error
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is missing. Reinstall Node.js with npm and try again.
  goto :error
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('[ERROR] Node.js 24 or newer is required. Current: ' + process.version); process.exit(1); }"
if errorlevel 1 goto :error

if not exist "node_modules\.bin\vite.cmd" goto :install
if not exist "node_modules\.bin\tsc.cmd" goto :install
goto :build

:install
echo [1/3] Installing dependencies...
call npm.cmd ci --include=dev
if errorlevel 1 goto :error
goto :compile

:build
echo [1/3] Using installed dependencies.

:compile
echo [2/3] Building Fantasy Map Generator...
call npm.cmd run build
if errorlevel 1 goto :error

echo [3/3] Starting local server. Press Ctrl+C or close this window to stop.
call npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort --open
if errorlevel 1 goto :error
popd
exit /b 0

:error
echo.
echo [ERROR] Startup failed. Check the message above, then run start.bat again.
pause
popd
exit /b 1
