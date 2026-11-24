@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Triad - send a launcher update
echo  ==================================================
echo.
echo  Publish a new build to every installed Triad launcher.
echo.
echo  The launcher will show an Update button on its next
echo  check, download the build when the user presses it,
echo  and show the patch notes after the restart.
echo.
echo  Paste a direct HTTPS link, or a local path to an
echo  installer you already built. A local path is uploaded
echo  to the GitHub release with gh, which supports files
echo  up to 2 GiB. The 25 MB limit is only for GitHub's
echo  website upload; it does not apply here.
echo.
echo  If you leave it blank, send.bat configures the feed,
echo  builds a fresh installer, and publishes it.
echo.
echo  Each fresh rebuild gets a higher patch version and an
echo  automatic maintenance note. Add custom notes in
echo  src/shared/releaseNotes.json before sending if you want.
echo.

set "NEW_LAUNCHER_URL="
set "GITHUB_REPO="

if not "%~1"=="" set "NEW_LAUNCHER_URL=%~1"
if not "%~2"=="" set "GITHUB_REPO=%~2"

if "%NEW_LAUNCHER_URL%"=="" (
  echo  Paste a direct HTTPS link, or a local installer path.
  echo  Leave it blank to configure the feed and build a fresh installer.
  echo.
  set /p "NEW_LAUNCHER_URL=  Installer link or path: "
)

if "%GITHUB_REPO%"=="" (
  for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set "GITHUB_REPO=%%r"
)

if "%GITHUB_REPO%"=="" (
  echo.
  set /p "GITHUB_REPO=  GitHub repository (owner/repo): "
)

if "%GITHUB_REPO%"=="" (
  echo.
  echo  No GitHub repository was given. Nothing was sent.
  echo  Set one with: send.bat "https://example.com/Triad-Setup.exe" "owner/repo"
  echo  Or use a local path: send.bat "release\Triad-Setup-1.0.1.exe" "owner/repo"
  echo.
  pause
  exit /b 1
)

if not "%NEW_LAUNCHER_URL%"=="" (
  echo  Make sure this installer was built after the feed was configured.
  echo  If it was not, leave the field blank so send.bat builds a correct one.
  echo.
)

if "%NEW_LAUNCHER_URL%"=="" (
  echo  No link supplied. Preparing the feed and building a local installer...
  echo.
  node scripts\publish-update.cjs --repo "%GITHUB_REPO%" --configure-feed-only
  if errorlevel 1 goto :failed
  call build.bat --no-pause
  if errorlevel 1 goto :failed
)

echo.
echo  Publishing...
echo.

node scripts\publish-update.cjs --repo "%GITHUB_REPO%" --configure-feed --url "%NEW_LAUNCHER_URL%"
if errorlevel 1 goto :failed

echo.
echo  Done. Users on an older Triad will see the update
echo  at their next check, then can press Update and
echo  Restart ^& update. Patch notes appear after restart.
echo.
pause
exit /b 0

:failed
echo.
echo  Publish failed. Check the message above, then try again.
echo.
pause
exit /b 1
