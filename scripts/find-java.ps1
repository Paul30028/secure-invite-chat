# Find a JDK and return JAVA_HOME path (no trailing slash preference)
# Prefer JDK 17 for Android Gradle.

function Test-JavaHome([string]$homePath) {
  if (-not $homePath) { return $false }
  $javaExe = Join-Path $homePath "bin\java.exe"
  return (Test-Path $javaExe)
}

function Get-JavaVersionMajor([string]$homePath) {
  try {
    $out = & (Join-Path $homePath "bin\java.exe") -version 2>&1 | Out-String
    if ($out -match 'version "(\d+)') { return [int]$Matches[1] }
    if ($out -match 'version "1\.(\d+)') { return [int]$Matches[1] }
  } catch {}
  return 0
}

$candidates = @()

# Already set
if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }

# Android Studio bundled JBR (most common on Windows)
$studioRoots = @(
  "$env:ProgramFiles\Android\Android Studio",
  "$env:ProgramFiles\Android\Android Studio1",
  "${env:ProgramFiles(x86)}\Android\Android Studio",
  "$env:LOCALAPPDATA\Programs\Android Studio",
  "C:\Program Files\Android\Android Studio",
  "D:\Android\Android Studio",
  "D:\Program Files\Android\Android Studio",
  # User install (Chinese path)
  "D:\软件\Android Studio",
  "D:\Software\Android Studio",
  "E:\软件\Android Studio",
  "E:\Android\Android Studio"
)
foreach ($root in $studioRoots) {
  if (Test-Path $root) {
    $candidates += (Join-Path $root "jbr")
    $candidates += (Join-Path $root "jre")
  }
}

# Common JDKs
$jdkGlobs = @(
  "C:\Program Files\Eclipse Adoptium\jdk-*",
  "C:\Program Files\Microsoft\jdk-*",
  "C:\Program Files\Java\jdk-*",
  "C:\Program Files\Amazon Corretto\jdk*",
  "C:\Program Files\Zulu\zulu*",
  "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\jdk-*"
)
foreach ($g in $jdkGlobs) {
  Get-ChildItem -Path $g -ErrorAction SilentlyContinue -Directory | ForEach-Object {
    $candidates += $_.FullName
  }
}

# ANDROID_STUDIO env
if ($env:ANDROID_STUDIO) {
  $candidates += (Join-Path $env:ANDROID_STUDIO "jbr")
}

$best = $null
$bestVer = -1
foreach ($c in $candidates | Select-Object -Unique) {
  if (-not (Test-JavaHome $c)) { continue }
  $v = Get-JavaVersionMajor $c
  # Prefer 17, then 21, then 11, then highest
  $score = $v
  if ($v -eq 17) { $score = 1000 }
  elseif ($v -eq 21) { $score = 900 }
  elseif ($v -eq 11) { $score = 800 }
  if ($score -gt $bestVer) {
    $bestVer = $score
    $best = $c
  }
}

if ($best) {
  Write-Output $best
  exit 0
}
exit 1
