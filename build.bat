@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PAUSE_AT_END=1"
if /i "%~1"=="--no-pause" set "PAUSE_AT_END=0"

echo ============================================
echo  Triad launcher build
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto :no_node

for /f "usebackq delims=" %%V in (`node -p "require('./package.json').version"`) do set "APP_VERSION=%%V"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 goto :failed
)

echo Running type check...
call npm run typecheck
if errorlevel 1 goto :failed

echo Building app and Windows installer...
call npm run dist
if errorlevel 1 goto :failed

echo.
echo Build complete.
set "INSTALLER=release\Triad-Setup-%APP_VERSION%.exe"
if exist "%INSTALLER%" (
  echo Installer:
  echo   %CD%\%INSTALLER%
) else (
  echo No installer was found in the release folder.
)
goto :done

:no_node
echo ERROR: Node.js and npm are required.
echo Install them from https://nodejs.org/ and run this file again.
goto :failed

:failed
echo.
echo Build failed. Review the output above.
if "%PAUSE_AT_END%"=="1" pause
exit /b 1

:done
if "%PAUSE_AT_END%"=="1" pause
exit /b 0
