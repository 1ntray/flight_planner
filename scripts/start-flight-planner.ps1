param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$preferredServerPort = 5173
$serverPort = $null
$serverUrl = $null
$processRecordPath = Join-Path ([System.IO.Path]::GetTempPath()) "flight-planner-vite.pid"
$serverProcess = $null
$viteProcessId = $null
$viteInputPath = $null

function Test-TcpPortAvailable {
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    $portProbe = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $Port
    )

    try {
        $portProbe.Start()
        return $true
    }
    catch [System.Net.Sockets.SocketException] {
        return $false
    }
    finally {
        $portProbe.Stop()
    }
}

try {
    $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
    $viteEntryPoint = Join-Path $projectRoot "node_modules\vite\bin\vite.js"

    if ($null -eq $nodeCommand) {
        throw "Node.js was not found. Install Node.js and then run this launcher again."
    }

    if (-not (Test-Path -LiteralPath $viteEntryPoint)) {
        throw "Project dependencies are missing. Open PowerShell in the project folder, run 'pnpm install', and then run this launcher again."
    }

    if (Test-Path -LiteralPath $processRecordPath) {
        throw "A previous launcher record exists. Run stop-flight-planner.cmd once, and then run this launcher again."
    }

    foreach ($candidatePort in $preferredServerPort..($preferredServerPort + 10)) {
        if (Test-TcpPortAvailable -Port $candidatePort) {
            $serverPort = $candidatePort
            break
        }
    }

    if ($null -eq $serverPort) {
        throw "No free local test port was found between $preferredServerPort and $($preferredServerPort + 10)."
    }

    $serverUrl = "http://127.0.0.1:$serverPort"

    Write-Host "Starting Flight Planner..." -ForegroundColor Cyan
    Write-Host "Browser and Vite diagnostics will appear in this window."

    $quotedViteEntryPoint = '"' + $viteEntryPoint + '"'
    # Keep Vite's diagnostics attached to this console, but prevent its own
    # interactive prompt from consuming the Enter used to stop the launcher.
    $viteInputPath = [System.IO.Path]::GetTempFileName()
    $serverProcess = Start-Process `
        -FilePath $nodeCommand.Source `
        -ArgumentList @(
            $quotedViteEntryPoint,
            "--host", "127.0.0.1",
            "--port", "$serverPort",
            "--strictPort"
        ) `
        -WorkingDirectory $projectRoot `
        -NoNewWindow `
        -RedirectStandardInput $viteInputPath `
        -PassThru

    $startupDeadline = (Get-Date).AddSeconds(20)
    $serverReady = $false

    while ((Get-Date) -lt $startupDeadline) {
        $serverProcess.Refresh()

        if ($serverProcess.HasExited) {
            throw "The Vite server exited before it became ready."
        }

        try {
            $response = Invoke-WebRequest `
                -Uri $serverUrl `
                -UseBasicParsing `
                -TimeoutSec 1
            $serverReady = $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
        }
        catch {
            $serverReady = $false
        }

        if ($serverReady) {
            break
        }

        Start-Sleep -Milliseconds 250
    }

    if (-not $serverReady) {
        throw "The Vite server did not become ready within 20 seconds."
    }

    $viteProcessId = $serverProcess.Id

    $processRecord = [ordered]@{
        processId = $viteProcessId
        startTimeUtcTicks = $serverProcess.StartTime.ToUniversalTime().Ticks
        port = $serverPort
    }
    $processRecord |
        ConvertTo-Json -Compress |
        Set-Content -LiteralPath $processRecordPath -Encoding Ascii

    if (-not $SkipBrowser) {
        Start-Process $serverUrl
    }

    Write-Host ""
    Write-Host "Flight Planner is running at $serverUrl" -ForegroundColor Green
    Write-Host "Keep this window open while testing."
    Write-Host ""
    [void](Read-Host "Press Enter here when you are finished; the server will be stopped")
}
catch {
    Write-Host ""
    Write-Host "Flight Planner could not be started:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    [void](Read-Host "Press Enter to close")
}
finally {
    if ($null -ne $serverProcess) {
        $serverProcess.Refresh()

        if (-not $serverProcess.HasExited) {
            Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
        }
    }

    if (Test-Path -LiteralPath $processRecordPath) {
        Remove-Item -LiteralPath $processRecordPath -Force -ErrorAction SilentlyContinue
    }

    if ($null -ne $viteInputPath -and (Test-Path -LiteralPath $viteInputPath)) {
        Remove-Item -LiteralPath $viteInputPath -Force -ErrorAction SilentlyContinue
    }
}
