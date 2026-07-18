@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo ============================================
echo  Secure Invite Chat - Android APK Build
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  goto :fail
)

REM ---- Auto-detect JAVA_HOME via PowerShell helper ----
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0find-java.ps1"`) do set "JAVA_HOME=%%i"

if not defined JAVA_HOME goto :nojava
if not exist "%JAVA_HOME%\bin\java.exe" goto :nojava

set "PATH=%JAVA_HOME%\bin;%PATH%"
echo [OK] JAVA_HOME=%JAVA_HOME%
java -version
echo.

REM ---- ANDROID_HOME + local.properties ----
if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_HOME (
  echo [ERROR] Android SDK not found at %%LOCALAPPDATA%%\Android\Sdk
  echo Open Android Studio -^> SDK Manager and install SDK.
  goto :fail
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
echo [OK] ANDROID_HOME=%ANDROID_HOME%

REM Write android\local.properties (forward slashes for Gradle)
if exist "android" (
  set "SDK_DIR=%ANDROID_HOME:\=/%"
  > "android\local.properties" echo sdk.dir=%SDK_DIR%
  echo [OK] wrote android\local.properties sdk.dir=%SDK_DIR%
)

echo [1/5] npm install ...
call npm install
if errorlevel 1 goto :fail

echo [2/5] Install Capacitor ...
call npm install @capacitor/core @capacitor/cli @capacitor/android --save
if errorlevel 1 goto :fail

echo [3/5] Build web ...
call npm run build
if errorlevel 1 goto :fail

if not exist "android\app" (
  echo [4/5] cap add android ...
  call npx cap add android
  if errorlevel 1 goto :fail
) else (
  echo [4/5] android exists, skip cap add
)

echo [5/5] cap sync + assembleDebug ...
call npx cap sync android
if errorlevel 1 goto :fail

if exist "android\gradlew.bat" (
  pushd android
  call gradlew.bat assembleDebug --no-daemon
  if errorlevel 1 (
    popd
    echo.
    echo [WARN] Gradle failed. Try Android Studio: npx cap open android
    goto :fail
  )
  popd
  echo.
  echo ========== SUCCESS ==========
  echo APK: android\app\build\outputs\apk\debug\app-debug.apk
) else (
  call npx cap open android
)

echo.
pause
exit /b 0

:nojava
echo.
echo [ERROR] JAVA_HOME not set / JDK not found.
echo.
echo Install Android Studio OR Temurin JDK 17, then either:
echo.
echo   setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
echo.
echo Or in PowerShell for this session only:
echo   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
echo   $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
echo   npm run build:android
echo.
echo Common path after installing Android Studio:
echo   C:\Program Files\Android\Android Studio\jbr
echo.
pause
exit /b 1

:fail
echo.
echo [FAILED]
pause
exit /b 1
