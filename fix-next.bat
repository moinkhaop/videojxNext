@echo off
echo Fixing .next directory issue...

REM Kill all node processes
taskkill /F /IM node.exe /T >nul 2>&1

REM Wait for processes to close
timeout /t 2 /nobreak >nul 2>&1

REM Try to remove .next directory
rd /s /q .next >nul 2>&1

REM If still can't remove, try with PowerShell
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1
powershell -Command "Remove-Item -Path '.next' -Recurse -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo .next directory cleaned!
echo.
echo Now you can run: npm run dev
pause
