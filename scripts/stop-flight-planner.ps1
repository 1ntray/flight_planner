$ErrorActionPreference = "Stop"

$processRecordPath = Join-Path ([System.IO.Path]::GetTempPath()) "flight-planner-vite.pid"

try {
    if (-not (Test-Path -LiteralPath $processRecordPath)) {
        Write-Host "No Flight Planner server started by the launcher is recorded." -ForegroundColor Yellow
        exit 0
    }

    $processRecord = Get-Content -LiteralPath $processRecordPath -Raw |
        ConvertFrom-Json
    $viteProcessId = [int]$processRecord.processId
    $expectedStartTimeUtcTicks = [long]$processRecord.startTimeUtcTicks
    $serverPort = [int]$processRecord.port

    $serverProcess = Get-Process -Id $viteProcessId -ErrorAction SilentlyContinue

    if ($null -eq $serverProcess) {
        Remove-Item -LiteralPath $processRecordPath -Force
        Write-Host "The recorded Flight Planner server is no longer running." -ForegroundColor Yellow
        exit 0
    }

    if (
        $serverProcess.ProcessName -ine "node" -or
        $serverProcess.StartTime.ToUniversalTime().Ticks -ne $expectedStartTimeUtcTicks
    ) {
        throw "The recorded process does not match the Flight Planner server started on port $serverPort. It was not stopped."
    }

    Stop-Process -Id $viteProcessId
    Remove-Item -LiteralPath $processRecordPath -Force
    Write-Host "Flight Planner has been stopped." -ForegroundColor Green
}
catch {
    Write-Host "Flight Planner could not be stopped safely:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
