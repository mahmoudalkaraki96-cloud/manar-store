@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js LTS from https://nodejs.org then run this file again.
 pause
 exit /b 1
)
call npm install
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run login
if errorlevel 1 goto failed
call npm run deploy
if errorlevel 1 goto failed
echo Gateway deployed. Send only the workers.dev URL to Mahmoud's manager chat.
echo DO NOT configure Meta yet. Secrets and delivery verification are still required.
pause
exit /b 0
:failed
echo Failed. Send the error text without secrets. No need to repeat all steps.
pause
exit /b 1
