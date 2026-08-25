@echo off
rem ============================================================
rem  PDFBox.online - local development
rem  Backend : FastAPI conversion API on http://localhost:8000
rem  Frontend: static dev server  on http://localhost:3000
rem            (also proxies /convert and /health to the API)
rem ============================================================

echo Starting Backend (FastAPI, port 8000)...
rem ALLOWED_ORIGINS lets the browser at localhost:3000 call the API directly
rem when you point it at port 8000; the dev server itself uses same-origin /convert.
start cmd /k "set ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Starting Frontend dev server (port 3000)...
start cmd /k "node server.mjs"

echo.
echo ============================================================
echo Servers are starting!
echo
echo  Frontend: http://localhost:3000
echo  Backend : http://localhost:8000/health
echo
echo  Open http://localhost:3000 in your browser.
echo ============================================================
