@echo off
echo Starting Backend (FastAPI)...
start cmd /k "cd backend && python -m uvicorn main:app --port 8000"

echo Starting Frontend...
start cmd /k "python -m http.server 3000"

echo.
echo ========================================================
echo Servers are starting!
echo Frontend will be available at: http://localhost:3000
echo Backend API is running on:     http://localhost:8000
echo ========================================================
