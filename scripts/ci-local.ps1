<#
.SYNOPSIS
    Runs local continuous integration suite for @kidthales/tol-palettes.
.DESCRIPTION
    Executes the full test and verification pipeline locally and in GitHub Actions:
    0. Gate 0: Workflow verify-job single-source contract (ci-local.ps1 -CI + exact job-id/step-name allowlist)
    1. Gate 1: Workflow action commit SHA pin verification, agent leak & secret audit
    2. Gate 2: PowerShell AST validation, linter & schema validation (npm run lint, npm run validate)
    3. Gate 3: Generated distribution drift audit (npm run generate -> git status dist data schema docs README.md)
    4. Gate 4: Test suite & packaging dry-run (npm test, side-effect guard, npm pack --dry-run, python -m build)
.PARAMETER CI
    Enforces strict fail-closed contract for CI runners (auto-enabled when $env:GITHUB_ACTIONS is set):
    rejects skip/quick flags, fails hard on missing tools, and emits GitHub Actions log groups.
.PARAMETER Quick
    Runs lint, validate, and tests only; skips distribution regeneration drift check.
.PARAMETER SkipGenerate
    Skips the distribution regeneration and drift verification step.
.PARAMETER Gate0Only
    Executes Gate 0 workflow contract verification and exits.
.PARAMETER WorkflowsPath
    Optional path override to .github/workflows directory (for testing).
.EXAMPLE
    pwsh ./scripts/ci-local.ps1
    pwsh ./scripts/ci-local.ps1 -Quick
    pwsh ./scripts/ci-local.ps1 -CI
#>
[CmdletBinding()]
param(
    [switch]$CI,
    [switch]$Quick,
    [switch]$SkipGenerate,
    [switch]$Gate0Only,
    [string]$WorkflowsPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

$TotalTimer = [System.Diagnostics.Stopwatch]::StartNew()

# Auto-enable $CI when running under GitHub Actions
$IsCI = $CI.IsPresent -or (-not [string]::IsNullOrWhiteSpace($env:GITHUB_ACTIONS))
if ($IsCI -and -not $CI) {
    $CI = [switch]::Present
}

function Enter-CiGate {
    param([string]$Title)
    if ($CI) {
        Write-Host "::group::$Title"
    }
    Write-Host "`n$Title" -ForegroundColor Yellow
}

function Exit-CiGate {
    if ($CI) {
        Write-Host "::endgroup::"
    }
}

function Write-Pass([string]$Message, [System.Diagnostics.Stopwatch]$Timer) {
    if ($Timer) {
        $elapsed = [math]::Round($Timer.Elapsed.TotalSeconds, 2)
        Write-Host "  -> [OK] $Message (${elapsed}s)" -ForegroundColor Green
    } else {
        Write-Host "  -> [OK] $Message" -ForegroundColor Green
    }
}

function Write-Fail([string]$Message) {
    Write-Host "  -> [FAIL] $Message" -ForegroundColor Red
}

# Fail-closed guard for -CI mode: reject any skip, quick, or partial-run switch immediately
if ($CI) {
    $rejectedFlags = @()
    if ($Quick) { $rejectedFlags += "-Quick" }
    if ($SkipGenerate) { $rejectedFlags += "-SkipGenerate" }
    if ($Gate0Only) { $rejectedFlags += "-Gate0Only" }
    if ($rejectedFlags.Count -gt 0) {
        $flagList = $rejectedFlags -join ", "
        [Console]::Error.WriteLine("ERROR: -CI mode is fail-closed and cannot be combined with skip or quick flags ($flagList).")
        exit 1
    }

    # Verify required tools upfront under -CI so missing binaries never silently degrade
    $requiredTools = @(
        @{ Name = "git"; Hint = "Install Git and ensure 'git' is on PATH." },
        @{ Name = "node"; Hint = "Install Node.js 22+ and ensure 'node' is on PATH." },
        @{ Name = "npm"; Hint = "Ensure 'npm' is on PATH." },
        @{ Name = "python"; Hint = "Install Python 3.12+ and ensure 'python' is on PATH." }
    )
    foreach ($tool in $requiredTools) {
        if (-not (Get-Command $tool.Name -ErrorAction SilentlyContinue)) {
            [Console]::Error.WriteLine("ERROR: -CI mode requires '$($tool.Name)' in PATH, but it was not found. $($tool.Hint)")
            exit 1
        }
    }
}


Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " tol-palettes Local CI Pipeline$(if ($CI) { ' [-CI Fail-Closed Mode]' } else { '' })" -ForegroundColor Cyan
Write-Host " Root: $RootDir" -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan

$GateResults = [ordered]@{
    "gate0_workflow_contract"     = "not-applicable"
    "gate1_action_pins_and_leaks" = "not-applicable"
    "gate2_pwsh_ast_and_lint"     = "not-applicable"
    "gate3_dist_drift"            = "not-applicable"
    "gate4_test_and_pack"         = "not-applicable"
}

$ActiveFlags = @()
if ($Quick) { $ActiveFlags += "-Quick" }
if ($SkipGenerate) { $ActiveFlags += "-SkipGenerate" }

Push-Location $RootDir
try {
    # Upfront runtime and dependency assertions
    $NodeVersionRaw = (& node -p "process.versions.node").Trim()
    $NodeVersionCore = ($NodeVersionRaw -split '[-+]')[0]
    if ([System.Version]$NodeVersionCore -lt [System.Version]"22.2.0") {
        throw "Node.js >= 22.2.0 is required; found $NodeVersionRaw."
    }

    & python -c "import matplotlib" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Python 'matplotlib' module is required but failed to import. Run 'pip install matplotlib'."
    }

    # -------------------------------------------------------------
    # Gate 0: Workflow Verify-Job Single-Source Contract
    # -------------------------------------------------------------
    $EffectiveWorkflowsDir = if ($WorkflowsPath) { $WorkflowsPath } else { [System.IO.Path]::Combine($RootDir, ".github", "workflows") }
    Enter-CiGate "[0/4] Gate 0: Verifying workflow single-source contract & exact step allowlist..."
    try {
        & node (Join-Path $RootDir "tools" "check-workflows.mjs") --workflows-dir $EffectiveWorkflowsDir
        if ($LASTEXITCODE -ne 0) {
            throw "Gate 0 workflow single-source verification failed."
        }
        $GateResults["gate0_workflow_contract"] = "pass"
        Write-Host "  -> All workflow run steps conform to ci-local.ps1 -CI or exact job-id/step-name allowlist." -ForegroundColor Green
    } finally {
        Exit-CiGate
    }

    if ($Gate0Only) {
        exit 0
    }

    # -------------------------------------------------------------
    # Gate 1: Action Commit SHA Pinning & Secret / Agent Leaks
    # -------------------------------------------------------------
    Enter-CiGate "[1/4] Verifying GitHub Actions commit SHA pins & secret hygiene..."
    try {
        $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()

        # Check action pins in all workflow files
        if (Test-Path $EffectiveWorkflowsDir) {
            $WorkflowFiles = Get-ChildItem -Path $EffectiveWorkflowsDir -File | Where-Object { $_.Extension -in @(".yml", ".yaml") }
            $UnpinnedFound = $false
            foreach ($wf in $WorkflowFiles) {
                $lines = Get-Content $wf.FullName
                for ($i = 0; $i -lt $lines.Count; $i++) {
                    $line = $lines[$i]
                    if ($line -match '^\s*(?:-\s+)?uses:\s*[''"]?([^''"\s#]+)[''"]?') {
                        $target = $matches[1]
                        if ($target -notmatch '^(\./|\.\./|docker://)') {
                            if ($target -notmatch '@[0-9a-fA-F]{40}') {
                                Write-Error "Unpinned action in $($wf.Name) line $($i+1): $target (must pin to 40-char commit SHA)"
                                $UnpinnedFound = $true
                            }
                        }
                    }
                }
            }
            if ($UnpinnedFound) {
                throw "Gate 1 Failed: GitHub Actions commit SHA pin verification failed."
            }
        }

        # Check agent and scratch file leaks
        $AgentFilePattern = '^(\.agents?/|\.gemini/|\.ai/|\.cursor/|\.claude/|scratch/|docs/learnings/|AGENTS\.md$|GEMINI\.md$|CLAUDE\.md$)'

        $TrackedFiles = & git ls-files
        $TrackedLeaks = @($TrackedFiles | Where-Object { $_ -match $AgentFilePattern })

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

        $GateResults["gate1_action_pins_and_leaks"] = "pass"
        Write-Pass "Action commit SHA pins and agent leak audits passed." $StepTimer
    } finally {
        Exit-CiGate
    }

    # -------------------------------------------------------------
    # Gate 2: PowerShell AST, Linter & Schema Validation
    # -------------------------------------------------------------
    Enter-CiGate "[2/4] Running PowerShell AST, linter and schema validation..."
    try {
        $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()

        if ($CI) {
            # Ensure npm dependencies are installed on clean runner
            if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
                Write-Host "  -> Installing npm dependencies (npm ci)..." -ForegroundColor DarkGray
                & npm ci
                if ($LASTEXITCODE -ne 0) {
                    throw "Gate 2 Failed: npm ci failed."
                }
            }
            # Ensure python build dependencies are available
            & python -c "import build, hatchling" 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  -> Installing Python build dependencies (build, hatchling)..." -ForegroundColor DarkGray
                & python -m pip install --quiet --upgrade pip build hatchling
                if ($LASTEXITCODE -ne 0) {
                    throw "Gate 2 Failed: Python build dependency installation failed."
                }
            }
        }

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

        $GateResults["gate2_pwsh_ast_and_lint"] = "pass"
        Write-Pass "PowerShell AST, linter, and schema validations passed." $StepTimer
    } finally {
        Exit-CiGate
    }

    # -------------------------------------------------------------
    # Gate 3: Generated Distribution Drift Audit
    # -------------------------------------------------------------
    Enter-CiGate "[3/4] Verifying generated distribution outputs are up to date..."
    try {
        $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()

        if (-not $SkipGenerate -and -not $Quick) {
            Write-Host "  -> Running npm run generate..." -ForegroundColor DarkGray
            & npm run generate
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "npm run generate failed with exit code $LASTEXITCODE."
                throw "Gate 3 Failed: Distribution generation failed."
            }

            $DriftPaths = @('dist', 'data', 'schema', 'docs', 'README.md')
            $DistStatus = & git status --porcelain -- $DriftPaths
            if ($DistStatus) {
                Write-Fail "Generated files ($($DriftPaths -join ', ')) differ from a fresh generation. Run 'npm run generate' and commit the result."
                Write-Host "Drift details:" -ForegroundColor Red
                & git status --porcelain -- $DriftPaths
                & git diff --stat -- $DriftPaths
                throw "Gate 3 Failed: Generated distribution drift detected."
            }

            $GateResults["gate3_dist_drift"] = "pass"
            Write-Pass "Generated outputs are up to date and clean." $StepTimer
        } else {
            $GateResults["gate3_dist_drift"] = "not-applicable"
            Write-Host "  -> Skipping distribution regeneration (-SkipGenerate or -Quick)." -ForegroundColor Gray
        }
    } finally {
        Exit-CiGate
    }

    # -------------------------------------------------------------
    # Gate 4: Composite Test Suite & Packaging Verification
    # -------------------------------------------------------------
    Enter-CiGate "[4/4] Running test suite and packaging verification (npm test, npm pack, python -m build)..."
    try {
        $StepTimer = [System.Diagnostics.Stopwatch]::StartNew()

        $PreTestStatus = (& git status --porcelain | Out-String)
        Write-Host "  -> Running npm test..." -ForegroundColor DarkGray
        & npm test
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm test failed with exit code $LASTEXITCODE."
            throw "Gate 4 Failed: Unit tests failed."
        }

        # Verify working tree remains 100% clean and side-effect-free after npm test
        $PostTestStatus = (& git status --porcelain | Out-String)
        if ($PostTestStatus -ne $PreTestStatus) {
            Write-Fail "Working tree was mutated by 'npm test'. Tests must be strictly read-only and side-effect-free."
            Write-Host "Dirty files produced by tests:" -ForegroundColor Red
            & git status --porcelain
            throw "Gate 4 Failed: Tests produced working tree side effects."
        }

        Write-Host "  -> Running npm pack --dry-run..." -ForegroundColor DarkGray
        & npm pack --dry-run
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm pack --dry-run failed with exit code $LASTEXITCODE."
            throw "Gate 4 Failed: Package packaging dry-run failed."
        }

        Write-Host "  -> Running Python packaging verification (python -m build, wheel import)..." -ForegroundColor DarkGray
        $pyTmp = New-Item -ItemType Directory -Path "$([System.IO.Path]::GetTempPath())tol_py_build_$([System.Guid]::NewGuid().ToString('N'))"
        try {
            & python -m build --no-isolation --outdir $pyTmp.FullName
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "python -m build failed with exit code $LASTEXITCODE."
                throw "Gate 4 Failed: Python build failed."
            }

            $wheels = @(Get-ChildItem -Path $pyTmp.FullName -Filter "*.whl")
            $sdists = @(Get-ChildItem -Path $pyTmp.FullName -Filter "*.tar.gz")
            if ($wheels.Count -eq 0 -or $sdists.Count -eq 0) {
                Write-Fail "Expected .whl and .tar.gz distributions in build output."
                throw "Gate 4 Failed: Missing wheel or sdist distribution."
            }

            # Verify wheel top-level module structure and execution
            $pyExtract = Join-Path $pyTmp.FullName "extracted"
            Expand-Archive -Path $wheels[0].FullName -DestinationPath $pyExtract -Force
            & python -c "import sys; sys.path.insert(0, sys.argv[1]); import tol_palettes; cset = tol_palettes.tol_cset('bright'); assert len(cset.blue) == 7" $pyExtract
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Wheel import or functional execution test failed."
                throw "Gate 4 Failed: Python wheel import test failed."
            }
            Write-Host "     * Python sdist & wheel packaging verified successfully" -ForegroundColor Green
        } finally {
            if (Test-Path $pyTmp.FullName) {
                Remove-Item -Recurse -Force $pyTmp.FullName
            }
        }

        $GateResults["gate4_test_and_pack"] = "pass"
        Write-Pass "Test suite and packaging dry-run passed." $StepTimer
    } finally {
        Exit-CiGate
    }

    # -------------------------------------------------------------
    # Write Local CI Receipt (.ci-local/receipt.json + history.jsonl)
    # -------------------------------------------------------------
    if ($CI) {
        Write-Host "`n  -> Skipping local CI receipt generation under -CI mode." -ForegroundColor Gray
    } else {
        $SeldonBin = $null
        if ($env:SELDON_BIN) {
            if ($env:SELDON_BIN -ne "none" -and (Test-Path $env:SELDON_BIN)) {
                $SeldonBin = $env:SELDON_BIN
            }
        } else {
            $StagingBin = "C:\Users\kidthales\.gemini\config\plugins\foundation\bin\seldon-staging.exe"
            $WinBin = "C:\Users\kidthales\.gemini\config\plugins\foundation\bin\seldon.exe"
            if ((Test-Path $StagingBin) -and (Test-Path $WinBin)) {
                if ((Get-Item $StagingBin).LastWriteTimeUtc -ge (Get-Item $WinBin).LastWriteTimeUtc) {
                    $SeldonBin = $StagingBin
                } else {
                    $SeldonBin = $WinBin
                }
            } elseif (Test-Path $StagingBin) {
                $SeldonBin = $StagingBin
            } elseif (Test-Path $WinBin) {
                $SeldonBin = $WinBin
            } else {
                $PathCmd = Get-Command "seldon" -ErrorAction SilentlyContinue
                if ($PathCmd) {
                    $SeldonBin = $PathCmd.Source
                }
            }
        }

        if (-not $SeldonBin) {
            Write-Host "`n  -> Skipping local CI receipt generation (seldon binary not found)." -ForegroundColor Gray
        } else {
            $GitStatus = (& git status --porcelain)
            if ($GitStatus) {
                Write-Host "`n  -> Skipping local CI receipt generation (working tree has uncommitted changes; commit changes and re-run on a clean tree to mint receipt)." -ForegroundColor Yellow
            } else {
                Write-Host "`n[Receipt] Recording local CI receipt via seldon ci receipt..." -ForegroundColor Yellow
                $GatePairs = @()
                foreach ($k in $GateResults.Keys) {
                    $GatePairs += "$k=$($GateResults[$k])"
                }
                $GateArg = $GatePairs -join ","
                $ReceiptArgs = @("ci", "receipt", "--dir", $RootDir, "--script-path", "scripts/ci-local.ps1", "--gates", $GateArg)
                if ($ActiveFlags.Count -gt 0) {
                    $ReceiptArgs += @("--flags", ($ActiveFlags -join ","))
                }
                & $SeldonBin @ReceiptArgs
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to write local CI receipt via seldon ci receipt."
                }
                Write-Host "  -> Local CI receipt written to .ci-local/receipt.json." -ForegroundColor Green
            }
        }
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
