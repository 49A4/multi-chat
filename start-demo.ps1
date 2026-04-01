$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$npmCache = Join-Path $PSScriptRoot "frontend\.npm-cache"
$mavenRepo = "C:\m2repo"
$defaultJavaHome = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$defaultMavenHome = "C:\tools\apache-maven-3.9.14"

if (Test-Path (Join-Path $defaultJavaHome "bin\java.exe")) {
    $javaHome = $defaultJavaHome
} elseif ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    $javaHome = $env:JAVA_HOME
} else {
    throw "Cannot find a valid JDK. Please install JDK 17 or set JAVA_HOME correctly."
}

$mavenHome = $defaultMavenHome
$mavenCmd = Join-Path $mavenHome "bin\mvn.cmd"
if (-not (Test-Path $mavenCmd)) {
    $mavenCmd = "mvn"
}

if ($mavenCmd -ne "mvn" -and -not (Test-Path $mavenCmd)) {
    throw "Cannot find Maven. Please install Maven or put mvn in PATH."
}

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"
if (-not (Test-Path (Join-Path $backendDir "pom.xml"))) {
    throw "Backend directory is invalid: $backendDir"
}
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    throw "Frontend directory is invalid: $frontendDir"
}

New-Item -ItemType Directory -Force -Path $mavenRepo | Out-Null

Write-Host "[1/3] Starting backend on http://localhost:8080 ..."
Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", "Set-Location '$backendDir'; `$env:JAVA_HOME='$javaHome'; `$env:MAVEN_HOME='$mavenHome'; `$env:Path='$mavenHome\bin;$javaHome\bin;' + `$env:Path; & '$mavenCmd' -s settings-local.xml spring-boot:run"

Write-Host "[2/3] Starting frontend on http://localhost:5173 ..."
if (Test-Path (Join-Path $frontendDir "node_modules")) {
    Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", "Set-Location '$frontendDir'; `$env:npm_config_cache='$npmCache'; npm run dev"
} else {
    Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", "Set-Location '$frontendDir'; `$env:npm_config_cache='$npmCache'; npm install --cache .npm-cache; npm run dev"
}

Write-Host "[3/3] Done. Two windows were opened."
