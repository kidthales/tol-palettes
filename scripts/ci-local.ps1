<#
.SYNOPSIS
    Runs local continuous integration suite for @kidthales/tol-palettes.
.DESCRIPTION
    Executes the full test and verification pipeline locally with 1:1 remote CI parity:
    1. Agent & scratch file leak audit (tracked & untracked)
    2. Linter & schema validation (npm run lint, npm run validate)
    3. Test suite & packaging dry-run (npm test, npm pack --dry-run)
    4. Generated distribution drift audit (npm run generate -> git status dist)
.PARAMETER Quick
    Runs lint, validate, and tests only; skips distribution regeneration drift check.
.PARAMETER SkipGenerate
    Skips the distribution regeneration and drift verification step.
.EXAMPLE
    pwsh ./scripts/ci-local.ps1
    pwsh ./scripts/ci-local.ps1 -Quick
#>
[CmdletBinding()]
param(
    [switch]$Quick,
    [switch]$SkipGenerate
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

$TotalTimer = [System.Diagnostics.Stopwatch]::StartNew()

function Write-StepHeader([int]$Step, [int]$TotalSteps, [string]$Title) {
    Write-Host "`n[$Step/$TotalSteps] $Title..." -ForegroundColor Yellow
}

function Write-Pass([string]$Message, [System.Diagnostics.Stopwatch]$Timer) {
    $elapsed = [math]::Round($Timer.Elapsed.TotalSeconds, 2)
    Write-Host "  -> [OK] $Message (${elapsed}s)" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
    Write-Host "  -> [FAIL] $Message" -ForegroundColor Red
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " tol-palettes Local CI Pipeline" -ForegroundColor Cyan
Write-Host " Root: $RootDir" -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan

$TotalSteps = 4

Push-Location $RootDir
try {
    # -------------------------------------------------------------
    # Gate 1: Agent & Scratch File Leak Audit
    # -------------------------------------------------------------
    $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-StepHeader 1 $TotalSteps "Auditing for agent & scratch file leaks"

    $AgentFilePattern = '^(\.agents?/|\.gemini/|\.ai/|\.cursor/|\.claude/|scratch/|docs/learnings/|AGENTS\.md$|GEMINI\.md$|CLAUDE\.md$)'

    # Check tracked files in git
    $TrackedFiles = & git ls-files
    $TrackedLeaks = @($TrackedFiles | Where-Object { $_ -match $AgentFilePattern })

    # Check untracked files
    $UntrackedFiles = & git ls-files --others --exclude-standard
    $UntrackedLeaks = @($UntrackedFiles | Where-Object { $_ -match $AgentFilePattern })

    $HasLeak = $false
    if ($TrackedLeaks.Count -gt 0) {
        Write-Fail "Tracked agent or scratch files detected in git:"
        foreach ($file in $TrackedLeaks) {
            Write-Host "     * $file" -ForegroundColor Red
        }
        $HasLeak = $true
    }

    if ($UntrackedLeaks.Count -gt 0) {
        Write-Fail "Untracked agent or scratch files detected in workspace:"
        foreach ($file in $UntrackedLeaks) {
            Write-Host "     * $file" -ForegroundColor Red
        }
        $HasLeak = $true
    }

    if ($HasLeak) {
        throw "Gate 1 Failed: Agent or scratch files must not exist or be tracked in the repository."
    }

    Write-Pass "No tracked or untracked agent files detected." $StepTimer

    # -------------------------------------------------------------
    # Gate 2: Linter & Schema Validation
    # -------------------------------------------------------------
    $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-StepHeader 2 $TotalSteps "Running linter and schema validation (npm run lint, npm run validate)"

    # PowerShell AST parse validation for scripts
    $Ps1Files = Get-ChildItem -Path $RootDir -Recurse -Filter "*.ps1" | Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules)[\\/]' }
    $ParseErrors = 0
    foreach ($ps in $Ps1Files) {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($ps.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        if ($errors.Count -gt 0) {
            Write-Fail "Parse error in $($ps.FullName): $($errors | Out-String)"
            $ParseErrors++
        }
    }
    if ($ParseErrors -gt 0) {
        throw "Gate 2 Failed: $ParseErrors PowerShell script(s) failed AST parse validation."
    }

    Write-Host "  -> Running npm run lint..." -ForegroundColor DarkGray
    & npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run lint failed with exit code $LASTEXITCODE."
        throw "Gate 2 Failed: Linter errors detected."
    }

    Write-Host "  -> Running npm run validate..." -ForegroundColor DarkGray
    & npm run validate
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run validate failed with exit code $LASTEXITCODE."
        throw "Gate 2 Failed: Schema validation failed."
    }

    Write-Pass "PowerShell AST, linter, and schema validations passed." $StepTimer

    # -------------------------------------------------------------
    # Gate 3: Test Suite & Packaging Verification
    # -------------------------------------------------------------
    $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-StepHeader 3 $TotalSteps "Running test suite and packaging verification (npm test, npm pack --dry-run)"

    Write-Host "  -> Running npm test..." -ForegroundColor DarkGray
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm test failed with exit code $LASTEXITCODE."
        throw "Gate 3 Failed: Unit tests failed."
    }

    Write-Host "  -> Running npm pack --dry-run..." -ForegroundColor DarkGray
    & npm pack --dry-run
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm pack --dry-run failed with exit code $LASTEXITCODE."
        throw "Gate 3 Failed: Package packaging dry-run failed."
    }

    Write-Host "  -> Running Python packaging verification (python -m build, wheel import)..." -ForegroundColor DarkGray
    $pyTmp = New-Item -ItemType Directory -Path "$([System.IO.Path]::GetTempPath())tol_py_build_$([System.Guid]::NewGuid().ToString('N'))"
    try {
        & python -m build --no-isolation --outdir $pyTmp.FullName
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "python -m build failed with exit code $LASTEXITCODE."
            throw "Gate 3 Failed: Python build failed."
        }

        $wheels = @(Get-ChildItem -Path $pyTmp.FullName -Filter "*.whl")
        $sdists = @(Get-ChildItem -Path $pyTmp.FullName -Filter "*.tar.gz")
        if ($wheels.Count -eq 0 -or $sdists.Count -eq 0) {
            Write-Fail "Expected .whl and .tar.gz distributions in build output."
            throw "Gate 3 Failed: Missing wheel or sdist distribution."
        }

        # Verify wheel top-level module structure and execution
        $pyExtract = Join-Path $pyTmp.FullName "extracted"
        Expand-Archive -Path $wheels[0].FullName -DestinationPath $pyExtract -Force
        & python -c "import sys; sys.path.insert(0, sys.argv[1]); import tol_palettes; cset = tol_palettes.tol_cset('bright'); assert len(cset.blue) == 7" $pyExtract
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Wheel import or functional execution test failed."
            throw "Gate 3 Failed: Python wheel import test failed."
        }
        Write-Host "     * Python sdist & wheel packaging verified successfully" -ForegroundColor Green
    } finally {
        if (Test-Path $pyTmp.FullName) {
            Remove-Item -Recurse -Force $pyTmp.FullName
        }
    }


    Write-Pass "Test suite and packaging dry-run passed." $StepTimer

    # -------------------------------------------------------------
    # Gate 4: Generated Distribution Drift Audit
    # -------------------------------------------------------------
    $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-StepHeader 4 $TotalSteps "Verifying generated distribution outputs are up to date"

    if (-not $SkipGenerate -and -not $Quick) {
        Write-Host "  -> Running npm run generate..." -ForegroundColor DarkGray
        & npm run generate
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm run generate failed with exit code $LASTEXITCODE."
            throw "Gate 4 Failed: Distribution generation failed."
        }

        $DistStatus = & git status --porcelain dist
        if ($DistStatus) {
            Write-Fail "dist/ differs from a fresh generation. Run 'npm run generate' and commit the result."
            Write-Host "Drift details:" -ForegroundColor Red
            & git status --porcelain dist
            & git diff --stat dist
            throw "Gate 4 Failed: Generated distribution drift detected."
        }

        Write-Pass "Generated outputs are up to date and clean." $StepTimer
    } else {
        Write-Host "  -> Skipping distribution regeneration (-SkipGenerate or -Quick)." -ForegroundColor Gray
    }

    # -------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------
    $TotalElapsed = [math]::Round($TotalTimer.Elapsed.TotalSeconds, 2)
    Write-Host "`n====================================================" -ForegroundColor Green
    Write-Host " All Local CI Verification Checks PASSED (${TotalElapsed}s)" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} finally {
    Pop-Location
}

