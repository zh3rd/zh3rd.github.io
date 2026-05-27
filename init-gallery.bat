@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto fail
)

echo Running gallery and resume asset initialization...
call npm run gallery:init
if errorlevel 1 goto fail

echo.
echo Initialization complete.
pause
exit /b 0

:fail
echo.
echo Initialization failed.
pause
exit /b 1
