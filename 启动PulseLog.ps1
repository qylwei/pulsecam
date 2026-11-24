[CmdletBinding()]
param([switch]$NoBrowser, [switch]$LocalOnly)

$ErrorActionPreference = 'Stop'

# The batch launchers always bind locally, regardless of inherited variables.
if ($LocalOnly) {
    $env:PULSELOG_HOST = '127.0.0.1'
} else {
    $env:PULSELOG_HOST = '0.0.0.0'
}

$project = Get-ChildItem -LiteralPath $PSScriptRoot -Directory |
    Where-Object { $_.Name -like '01_*' -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'src/server.js')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json')) } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $project) {
    Write-Host 'PulseCam Web project was not found next to this launcher.'
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js 22 or newer is required to run PulseCam.'
    exit 1
}
$nodeVersion = & $node.Source --version
$major = [regex]::Match($nodeVersion, '^v(\d+)')
if (-not $major.Success -or [int]$major.Groups[1].Value -lt 22) {
    Write-Host "Node.js 22 or newer is required (found $nodeVersion)."
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules/express'))) {
    Write-Host 'Dependencies are missing. Run npm ci in the Web project directory first.'
    exit 1
}

$projectPath = [System.IO.Path]::GetFullPath($project).ToLowerInvariant()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($projectPath))
    $projectId = [System.BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
} finally {
    $sha.Dispose()
}

$port = 3100
while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2
        if ($health.ok -and $health.service -eq 'PulseLog API' -and
            $health.projectId -eq $projectId) {
            $url = "http://localhost:$port"
            if (-not $NoBrowser) {
                Start-Process $url
            }
            Write-Host "PulseCam is already running at $url"
            exit 0
        }
    } catch {}
    $port++
    if ($port -gt 3110) {
        Write-Host 'Ports 3100 through 3110 are occupied.'
        exit 1
    }
}

$env:PORT = [string]$port
$server = Start-Process -FilePath $node.Source -ArgumentList 'src/server.js' -WorkingDirectory $project -WindowStyle Hidden -PassThru

for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($server.HasExited) {
        Write-Host 'PulseCam server exited during startup. Check the Node.js dependencies.'
        exit 1
    }
    Start-Sleep -Milliseconds 250
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 1
        if ($health.ok -and $health.service -eq 'PulseLog API') {
            $url = "http://localhost:$port"
            if (-not $NoBrowser) {
                Start-Process $url
            }
            Write-Host "PulseCam is running at $url"
            exit 0
        }
    } catch {}
}

Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
Write-Host 'PulseCam server did not become ready in time.'
exit 1
