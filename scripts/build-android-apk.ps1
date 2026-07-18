# Secure Invite Chat - Android APK build (auto JAVA_HOME)
# Note: do NOT use ErrorActionPreference=Stop globally — java -version writes to stderr
# and PowerShell would treat it as a terminating error.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "============================================"
Write-Host " Secure Invite Chat - Android APK Build"
Write-Host "============================================"

function Need-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $name"
  }
}

function Invoke-Native([scriptblock]$cmd, [string]$failMsg) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw $failMsg }
}

Need-Cmd node
Need-Cmd npm

# ---- Resolve JAVA_HOME (prefer env if already set by user) ----
$javaHome = $null
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
  $javaHome = $env:JAVA_HOME
} else {
  $findScript = Join-Path $PSScriptRoot "find-java.ps1"
  try {
    $javaHome = (& powershell -NoProfile -ExecutionPolicy Bypass -File $findScript 2>$null | Select-Object -Last 1)
    if ($javaHome) { $javaHome = $javaHome.Trim() }
  } catch {}
}

if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\java.exe"))) {
  Write-Host ""
  Write-Host "[ERROR] JAVA_HOME not found."
  Write-Host '  $env:JAVA_HOME = "D:\软件\Android Studio\jbr"'
  Write-Host '  $env:Path = "$env:JAVA_HOME\bin;" + $env:Path'
  Write-Host "  npm run build:android"
  throw "JAVA_HOME missing"
}

$env:JAVA_HOME = $javaHome
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
Write-Host "[OK] JAVA_HOME = $env:JAVA_HOME"
# java -version prints to stderr — redirect without treating as error
cmd /c "`"$env:JAVA_HOME\bin\java.exe`" -version 2>&1"

# ---- ANDROID_HOME + android/local.properties (required by Gradle) ----
$sdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT,
  "$env:LOCALAPPDATA\Android\Sdk",
  "$env:USERPROFILE\AppData\Local\Android\Sdk",
  "C:\Android\Sdk",
  "D:\Android\Sdk",
  "D:\软件\Android\Sdk",
  "D:\软件\Android Studio\sdk"
) | Where-Object { $_ }

$sdkHome = $null
foreach ($sdk in $sdkCandidates) {
  if ($sdk -and (Test-Path $sdk)) {
    $sdkHome = $sdk
    break
  }
}

if (-not $sdkHome) {
  Write-Host "[ERROR] Android SDK not found."
  Write-Host "Open Android Studio once -> SDK Manager -> install Android SDK."
  Write-Host "Default path: $env:LOCALAPPDATA\Android\Sdk"
  throw "ANDROID_HOME / SDK missing"
}

$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome
Write-Host "[OK] ANDROID_HOME = $env:ANDROID_HOME"

# Gradle reads android/local.properties — use forward slashes (most reliable on Windows)
function ConvertTo-SdkDirProperty([string]$path) {
  return ($path -replace '\\', '/')
}

$localPropsDir = Join-Path (Get-Location) "android"
if (Test-Path $localPropsDir) {
  $sdkDirProp = ConvertTo-SdkDirProperty $sdkHome
  $localProps = Join-Path $localPropsDir "local.properties"
  "sdk.dir=$sdkDirProp" | Set-Content -Path $localProps -Encoding ASCII
  Write-Host "[OK] Wrote android\local.properties -> $sdkDirProp"
} else {
  Write-Host "[INFO] android/ not yet present; will write local.properties after cap add"
}

Write-Host "[1/5] npm install ..."
Invoke-Native { npm install } "npm install failed"

Write-Host "[2/5] Install Capacitor ..."
Invoke-Native { npm install @capacitor/core @capacitor/cli @capacitor/android --save } "capacitor install failed"

Write-Host "[3/5] Build web (base must be ./ for Capacitor) ..."
Invoke-Native { npm run build } "npm run build failed"

# Sanity check: absolute /assets/ causes Android black screen
$builtIndex = "dist\index.html"
if (Test-Path $builtIndex) {
  $html = Get-Content $builtIndex -Raw
  if ($html -match 'src="/assets/') {
    throw "dist/index.html still uses absolute /assets/ paths. Set vite base: './' and rebuild."
  }
  Write-Host "[OK] dist asset paths look relative (Capacitor-safe)"
}

if (-not (Test-Path "android\app")) {
  Write-Host "[4/5] cap add android ..."
  Invoke-Native { npx cap add android } "cap add android failed"
} else {
  Write-Host "[4/5] android\ exists, skip cap add"
}

# Ensure local.properties exists after android/ is present
if ($env:ANDROID_HOME -and (Test-Path "android")) {
  $sdkDirProp = ConvertTo-SdkDirProperty $env:ANDROID_HOME
  "sdk.dir=$sdkDirProp" | Set-Content -Path "android\local.properties" -Encoding ASCII
  Write-Host "[OK] android\local.properties -> $sdkDirProp"
}

Write-Host "[5/5] cap sync android ..."
Invoke-Native { npx cap sync android } "cap sync failed"

$gradlew = "android\gradlew.bat"
if (Test-Path $gradlew) {
  Push-Location android
  try {
    Write-Host "Running gradlew assembleDebug (JAVA_HOME=$env:JAVA_HOME) ..."
    # Use cmd so Gradle batch + Java stderr don't trip PowerShell
    cmd /c "gradlew.bat assembleDebug --no-daemon"
    if ($LASTEXITCODE -ne 0) { throw "gradlew assembleDebug failed" }
  } finally {
    Pop-Location
  }
  $apk = "android\app\build\outputs\apk\debug\app-debug.apk"
  Write-Host ""
  Write-Host "========== SUCCESS =========="
  Write-Host "APK: $apk"
  if (Test-Path $apk) {
    Write-Host "Full: $((Resolve-Path $apk).Path)"
  }
  Write-Host "Phone Settings -> ws://YOUR_PC_LAN_IP:8765"
} else {
  Write-Host "gradlew missing, opening Android Studio..."
  npx cap open android
}

Write-Host "Done."
