@echo off
title Safar Portal Launcher
color 0B
echo ============================================================
echo   SAFAR - Tours, Hotels ^& Luxury Travel Platform
echo ============================================================
echo.
echo  [1] Launch Safar Full-Stack Portal (React + Vite + Node.js) [Recommended]
echo  [2] Launch Python Flask Prototype (app.py)
echo.
echo  Auto-starting [1] Safar Full-Stack Portal in 4 seconds...
echo.

choice /c 12 /t 4 /d 1 /m "Select option"
if errorlevel 2 goto run_python
if errorlevel 1 goto run_node

:run_node
echo.
echo ============================================================
echo   Starting Safar Full-Stack Web Platform...
echo ============================================================
echo.

:: 1. Verify and auto-install frontend dependencies if needed
if not exist "node_modules\" (
    echo [Setup] Installing frontend dependencies...
    call npm install
)

:: 2. Verify and auto-install backend dependencies if needed
if not exist "server\node_modules\" (
    echo [Setup] Installing backend dependencies...
    pushd server
    call npm install
    popd
)

echo [1/3] Launching Safar Backend Express Server (Port 5000)...
start "Safar Backend API" cmd /k "cd server && npm start"

echo [2/3] Initializing services (3s buffer)...
timeout /t 3 /nobreak >nul

echo [3/3] Launching Vite Frontend Server (Port 5173)...
start http://localhost:5173/
npm run dev
goto end

:run_python
echo.
echo ============================================================
echo   Starting Python Flask Prototype (app.py)...
echo ============================================================
if not exist ".venv\" (
    echo [Setup] Creating Python virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
echo [Setup] Installing Python requirements...
python -m pip install -r requirements.txt
start http://127.0.0.1:5000/
python app.py
goto end

:end
pause
