# One-shot: set JAVA_HOME for this PowerShell session
# java.exe is at:  D:\软件\Android Studio\jbr\bin\java.exe
# JAVA_HOME must be the parent of bin:  D:\软件\Android Studio\jbr
#
# Usage (dot-source so env vars stay in current shell):
#   . .\scripts\set-java-home.ps1
#   npm run build:android

$jbr = "D:\软件\Android Studio\jbr"
$javaExe = Join-Path $jbr "bin\java.exe"

if (-not (Test-Path $javaExe)) {
  Write-Host "[ERROR] Not found: $javaExe"
  exit 1
}

# IMPORTANT: JAVA_HOME = folder that CONTAINS bin\, not bin itself
$env:JAVA_HOME = $jbr
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path

Write-Host "[OK] JAVA_HOME = $env:JAVA_HOME"
Write-Host "[OK] java.exe  = $javaExe"
cmd /c "`"$javaExe`" -version 2>&1"

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
if (Test-Path $sdk) {
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  Write-Host "[OK] ANDROID_HOME = $env:ANDROID_HOME"
} else {
  Write-Host "[WARN] SDK not at $sdk — open Android Studio once to install SDK"
}

Write-Host ""
Write-Host "Next:  npm run build:android"
