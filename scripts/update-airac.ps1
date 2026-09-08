param(
    [switch]$NoPause,
    [switch]$AssumeYes
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$githubOutputPath = [System.IO.Path]::GetTempFileName()
$previousGithubOutput = $env:GITHUB_OUTPUT
$originalLocation = Get-Location
$exitCode = 0

function Invoke-NodeProjectTool {
    param(
        [Parameter(Mandatory)]
        [string]$EntryPoint,

        [string[]]$Arguments = @()
    )

    & $script:nodeCommand.Source $EntryPoint @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE."
    }
}

function Get-AiracOutputValue {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    $value = $null
    foreach ($line in Get-Content -LiteralPath $script:githubOutputPath) {
        if ($line -match ('^' + [regex]::Escape($Name) + '=(.*)$')) {
            $value = $Matches[1]
        }
    }
    return $value
}

function Wait-BeforeClose {
    if (-not $NoPause) {
        Write-Host ""
        [void](Read-Host "Press Enter to close")
    }
}

try {
    Set-Location -LiteralPath $projectRoot

    $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) {
        throw "Node.js was not found. Install Node.js and run this tool again."
    }

    $tsxEntryPoint = Join-Path $projectRoot "node_modules\tsx\dist\cli.mjs"
    $airacEntryPoint = Join-Path $projectRoot "tools\aeronautical\avinor-eaip\airacUpdateCli.ts"
    $typescriptEntryPoint = Join-Path $projectRoot "node_modules\typescript\bin\tsc"
    $vitestEntryPoint = Join-Path $projectRoot "node_modules\vitest\vitest.mjs"
    $viteEntryPoint = Join-Path $projectRoot "node_modules\vite\bin\vite.js"

    foreach ($requiredPath in @(
        $tsxEntryPoint,
        $airacEntryPoint,
        $typescriptEntryPoint,
        $vitestEntryPoint,
        $viteEntryPoint
    )) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Project dependencies are missing. Run 'pnpm install' in the project folder first."
        }
    }

    $env:GITHUB_OUTPUT = $githubOutputPath

    Write-Host "Flight Planner AIRAC updater" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "This tool never commits, pushes, or merges an AIRAC update."
    Write-Host "A generated candidate still requires human review." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Step 1 of 5: Checking Avinor for a newer edition..." -ForegroundColor Cyan
    Invoke-NodeProjectTool -EntryPoint $tsxEntryPoint -Arguments @(
        $airacEntryPoint,
        "--check"
    )

    $updateAvailable = Get-AiracOutputValue -Name "update_available"
    if ($updateAvailable -ne "true") {
        if ($updateAvailable -ne "false") {
            throw "The edition check did not return a valid update result."
        }
        Write-Host ""
        Write-Host "The locally approved AIRAC edition is already current." -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "A newer edition is available." -ForegroundColor Yellow
        Write-Host "The next step downloads and validates the complete candidate,"
        Write-Host "writes versioned data/report files, and updates the local selector."
        Write-Host ""

        $confirmed = $AssumeYes
        if (-not $confirmed) {
            $answer = Read-Host "Prepare and verify this candidate now? [y/N]"
            $confirmed = $answer.Trim() -match '^(?i:y|yes)$'
        }

        if (-not $confirmed) {
            Write-Host "AIRAC update cancelled. No candidate files were changed." -ForegroundColor Yellow
        }
        else {
            Write-Host ""
            Write-Host "Step 2 of 5: Importing and validating the candidate..." -ForegroundColor Cyan
            Invoke-NodeProjectTool -EntryPoint $tsxEntryPoint -Arguments @(
                $airacEntryPoint,
                "--update"
            )

            Write-Host ""
            Write-Host "Step 3 of 5: Running the TypeScript compiler..." -ForegroundColor Cyan
            Invoke-NodeProjectTool -EntryPoint $typescriptEntryPoint -Arguments @("-b")

            Write-Host ""
            Write-Host "Step 4 of 5: Running all tests..." -ForegroundColor Cyan
            Invoke-NodeProjectTool -EntryPoint $vitestEntryPoint -Arguments @("run")

            Write-Host ""
            Write-Host "Step 5 of 5: Building the production application..." -ForegroundColor Cyan
            Invoke-NodeProjectTool -EntryPoint $viteEntryPoint -Arguments @("build")

            $changeReportPath = Get-AiracOutputValue -Name "change_report_path"
            Write-Host ""
            Write-Host "AIRAC candidate prepared and all checks passed." -ForegroundColor Green
            Write-Host "It has not been committed, pushed, or merged. Review the generated diff and report."

            if (-not [string]::IsNullOrWhiteSpace($changeReportPath)) {
                $absoluteReportPath = Join-Path $projectRoot $changeReportPath
                if (Test-Path -LiteralPath $absoluteReportPath) {
                    Write-Host "Change report: $absoluteReportPath"
                    Start-Process `
                        -FilePath "notepad.exe" `
                        -ArgumentList ('"' + $absoluteReportPath + '"')
                }
            }
        }
    }
}
catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "The AIRAC update did not complete:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "No commit, push, or merge was performed. Inspect the messages above before retrying."
}
finally {
    if ($null -eq $previousGithubOutput) {
        Remove-Item Env:GITHUB_OUTPUT -ErrorAction SilentlyContinue
    }
    else {
        $env:GITHUB_OUTPUT = $previousGithubOutput
    }

    Remove-Item -LiteralPath $githubOutputPath -Force -ErrorAction SilentlyContinue
    Set-Location -LiteralPath $originalLocation
    Wait-BeforeClose
}

exit $exitCode
