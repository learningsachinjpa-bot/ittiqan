@echo off
echo ========================================
echo   Starting Ittiqan Platform
echo ========================================

echo [1/3] Starting Database and Redis...
docker-compose up -d
timeout /t 5 /nobreak > nul

echo [2/3] Starting Backend API...
start "Ittiqan Backend" cmd /k "cd /d C:\Users\Sachin Patil\Documents\ittiqan\backend && pip install -r requirements.txt -q && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [3/3] Starting Frontend...
start "Ittiqan Frontend" cmd /k "cd /d C:\Users\Sachin Patil\Documents\ittiqan\frontend && npm run dev"

echo.
echo ========================================
echo   Ittiqan is starting up!
echo   Frontend: http://localhost:3000
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ========================================
pause
