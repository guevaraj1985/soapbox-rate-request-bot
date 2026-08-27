@echo off
setlocal

cd /d "%~dp0"

echo Soapbox Rate Request Bot
echo ========================
echo Folder: %CD%
echo.

if not exist ".env" (
  echo ERROR: .env was not found in this folder.
  echo Copy the working .env file into this folder, then run START-BOT.bat again.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Install Node.js LTS from https://nodejs.org, then reopen this window.
  echo.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm was not found. Installing pnpm globally with npm...
  npm install -g pnpm
  if errorlevel 1 (
    echo.
    echo ERROR: Could not install pnpm.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Installing project packages...
  pnpm install
  if errorlevel 1 (
    echo.
    echo ERROR: pnpm install failed.
    pause
    exit /b 1
  )
)

echo Running database migrations...
pnpm run migrate
if errorlevel 1 (
  echo.
  echo ERROR: Database migration failed.
  pause
  exit /b 1
)

echo Building bot...
pnpm run build
if errorlevel 1 (
  echo.
  echo ERROR: Build failed.
  pause
  exit /b 1
)

echo.
echo Starting bot. Leave this window open while the bot is running.
echo Press Ctrl+C to stop it.
echo.
pnpm start

echo.
echo Bot stopped.
pause
