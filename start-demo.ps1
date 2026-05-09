$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$checkOnly = $args -contains "--check"

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
$runStateDir = Join-Path $PSScriptRoot ".run"
$runStateFile = Join-Path $runStateDir "start-demo-pids.json"
if (-not (Test-Path (Join-Path $backendDir "pom.xml"))) {
    throw "Backend directory is invalid: $backendDir"
}
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    throw "Frontend directory is invalid: $frontendDir"
}

if ([string]::IsNullOrWhiteSpace($env:KEEP_LOG_WINDOW)) {
    $keepLogWindow = $false
} else {
    $keepLogWindow = $env:KEEP_LOG_WINDOW -match "^(1|true|yes|on)$"
}

$launcherShellExecutable = $null
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) {
    $launcherShellExecutable = $pwshCommand.Source
} else {
    $powershellCommand = Get-Command powershell -ErrorAction SilentlyContinue
    if ($powershellCommand) {
        $launcherShellExecutable = $powershellCommand.Source
    }
}

if ([string]::IsNullOrWhiteSpace($launcherShellExecutable)) {
    throw "Cannot find child launcher shell (pwsh or powershell)."
}

function Start-LauncherPowerShell([string]$command) {
    $args = @("-NoProfile")
    if ($keepLogWindow) {
        $args += "-NoExit"
    }
    $args += "-Command"
    $args += $command
    return Start-Process $launcherShellExecutable -PassThru -ArgumentList $args
}

function Assert-LauncherShellAvailable {
    try {
        $probe = Start-Process $launcherShellExecutable -PassThru -WindowStyle Hidden -ArgumentList @(
            "-NoProfile",
            "-Command",
            "exit 0"
        )
        $probe.WaitForExit()
        if ($probe.ExitCode -ne 0) {
            throw "ExitCode=$($probe.ExitCode)"
        }
    } catch {
        throw "Cannot start child shell '$launcherShellExecutable'. Use start-demo-cmd.bat as fallback."
    }
}

function Get-RecordedLauncherState {
    if (-not (Test-Path $runStateFile)) {
        return $null
    }
    try {
        return (Get-Content $runStateFile -Raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Stop-ProcessTreeByPid([int]$pidValue, [string]$name) {
    if ($pidValue -le 0) {
        return
    }
    if ($pidValue -eq $PID) {
        return
    }
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if (-not $proc) {
        return
    }
    Write-Host "[cleanup] Stopping $name process tree (PID $pidValue) ..."
    try {
        & taskkill /PID $pidValue /T /F | Out-Null
    } catch {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    }
}

function Stop-RecordedProcessIfMatch([object]$entry, [string]$name) {
    if (-not $entry) {
        return
    }
    $pidValue = 0
    try {
        $pidValue = [int]$entry.pid
    } catch {
        return
    }
    if ($pidValue -le 0) {
        return
    }

    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if (-not $proc) {
        return
    }

    $expectedStartTicks = $null
    try {
        $expectedStartTicks = [long]$entry.startTicks
    } catch {
        $expectedStartTicks = $null
    }

    $isSameProcess = $true
    if ($expectedStartTicks -ne $null) {
        try {
            $isSameProcess = ($proc.StartTime.ToUniversalTime().Ticks -eq $expectedStartTicks)
        } catch {
            $isSameProcess = $false
        }
    }

    if (-not $isSameProcess) {
        return
    }

    Stop-ProcessTreeByPid $pidValue ("previous $name")
}

function Stop-PreviousLauncherProcesses {
    $state = Get-RecordedLauncherState
    if (-not $state) {
        return
    }

    Stop-RecordedProcessIfMatch $state.backend "backend"
    Stop-RecordedProcessIfMatch $state.frontend "frontend"
    Remove-Item -LiteralPath $runStateFile -Force -ErrorAction SilentlyContinue
}

function Get-ListeningPidsByPort([int]$port) {
    $pids = @()
    try {
        $pids = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        $pids = @()
    }

    if (-not $pids -or $pids.Count -eq 0) {
        $lines = netstat -ano -p tcp | Select-String -Pattern "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$"
        foreach ($line in $lines) {
            $parts = ($line.Line -split "\s+") | Where-Object { $_ -ne "" }
            if ($parts.Count -ge 5) {
                $pidToken = $parts[-1]
                $parsed = 0
                if ([int]::TryParse($pidToken, [ref]$parsed)) {
                    $pids += $parsed
                }
            }
        }
        $pids = $pids | Select-Object -Unique
    }

    return $pids
}

function Stop-ProcessesOnPorts([int[]]$ports) {
    foreach ($port in $ports) {
        $pids = Get-ListeningPidsByPort $port
        foreach ($pidValue in $pids) {
            if ($pidValue -and $pidValue -gt 0 -and $pidValue -ne 4 -and $pidValue -ne $PID) {
                Stop-ProcessTreeByPid $pidValue ("port $port")
            }
        }
    }
}

if ([string]::IsNullOrWhiteSpace($env:FRONTEND_DEV_ARGS)) {
    $frontendDevArgs = "-- --host 0.0.0.0"
} else {
    $frontendDevArgs = $env:FRONTEND_DEV_ARGS
}

New-Item -ItemType Directory -Force -Path $runStateDir | Out-Null
New-Item -ItemType Directory -Force -Path $mavenRepo | Out-Null

Assert-LauncherShellAvailable
if ($checkOnly) {
    Write-Host "[CHECK] Environment looks good for PowerShell launcher."
    return
}
Stop-PreviousLauncherProcesses
Stop-ProcessesOnPorts @(8080, 5173)

Write-Host "[1/3] Starting backend on http://localhost:8080 ..."
$backendProc = Start-LauncherPowerShell "Set-Location '$backendDir'; `$env:JAVA_HOME='$javaHome'; `$env:MAVEN_HOME='$mavenHome'; `$env:Path='$mavenHome\bin;$javaHome\bin;' + `$env:Path; & '$mavenCmd' -s settings-local.xml spring-boot:run"

Write-Host "[2/3] Starting frontend on http://localhost:5173 (LAN exposed) ..."
if (Test-Path (Join-Path $frontendDir "node_modules")) {
    $frontendProc = Start-LauncherPowerShell "Set-Location '$frontendDir'; `$env:npm_config_cache='$npmCache'; npm run dev $frontendDevArgs"
} else {
    $frontendProc = Start-LauncherPowerShell "Set-Location '$frontendDir'; `$env:npm_config_cache='$npmCache'; npm install --cache .npm-cache; npm run dev $frontendDevArgs"
}

$stateToSave = [pscustomobject]@{
    backend = [pscustomobject]@{
        pid = $backendProc.Id
        startTicks = $backendProc.StartTime.ToUniversalTime().Ticks
    }
    frontend = [pscustomobject]@{
        pid = $frontendProc.Id
        startTicks = $frontendProc.StartTime.ToUniversalTime().Ticks
    }
    updatedAt = (Get-Date).ToString("o")
}
$stateToSave | ConvertTo-Json -Depth 4 | Set-Content -Path $runStateFile -Encoding UTF8

Write-Host "[3/3] Done. Two windows were opened."
