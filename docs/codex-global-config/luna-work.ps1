[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TaskFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Message, [int]$Code = 2) {
  Write-Error $Message
  exit $Code
}

function Get-ChangedPaths([string]$RepositoryRoot) {
  $lines = @(& git -C $RepositoryRoot status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    Fail 'Unable to inspect Git status.' 3
  }

  return @($lines | ForEach-Object {
    if ($_.Length -lt 4) { return }
    $path = $_.Substring(3).Trim()
    if ($path.Contains(' -> ')) {
      $path = $path.Split(' -> ')[-1]
    }
    $path.Replace('\', '/')
  } | Where-Object { $_ })
}

if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) {
  Fail "Task file does not exist: $TaskFile"
}

$resolvedTaskFile = (Resolve-Path -LiteralPath $TaskFile).Path
try {
  $task = Get-Content -LiteralPath $resolvedTaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Fail "Task file is not valid UTF-8 JSON: $($_.Exception.Message)"
}

$required = @('objective', 'workingDirectory', 'allowedFiles', 'forbiddenScope', 'verificationCommands')
foreach ($name in $required) {
  if ($null -eq $task.PSObject.Properties[$name]) {
    Fail "Task contract is missing required field: $name"
  }
}

$objective = [string]$task.objective
if ([string]::IsNullOrWhiteSpace($objective) -or $objective.Contains("`n") -or $objective.Contains("`r")) {
  Fail 'objective must be one non-empty sentence on one line.'
}

if (-not [System.IO.Path]::IsPathRooted([string]$task.workingDirectory)) {
  Fail 'workingDirectory must be an absolute path.'
}
if (-not (Test-Path -LiteralPath ([string]$task.workingDirectory) -PathType Container)) {
  Fail "workingDirectory does not exist: $($task.workingDirectory)"
}
$workingDirectory = (Resolve-Path -LiteralPath ([string]$task.workingDirectory)).Path

$repositoryRoot = (& git -C $workingDirectory rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
  Fail 'workingDirectory must be inside a Git repository.'
}
$repositoryRoot = [System.IO.Path]::GetFullPath($repositoryRoot.Trim())

$initialChanges = @(Get-ChangedPaths $repositoryRoot)
if ($initialChanges.Count -ne 0) {
  Fail ('Fallback requires a clean isolated worktree. Existing changes: ' + ($initialChanges -join ', '))
}

$allowedFiles = @($task.allowedFiles | ForEach-Object { ([string]$_).Replace('\', '/').TrimStart('/') })
if (@($allowedFiles | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -ne 0) {
  Fail 'allowedFiles cannot contain blank entries.'
}
foreach ($relativePath in $allowedFiles) {
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $relativePath))
  $prefix = $repositoryRoot.TrimEnd('\') + '\'
  if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "allowedFiles entry escapes the repository: $relativePath"
  }
}

$forbiddenScope = @($task.forbiddenScope | ForEach-Object { [string]$_ })
$verificationCommands = @($task.verificationCommands | ForEach-Object { [string]$_ })
if ($forbiddenScope.Count -eq 0 -or $verificationCommands.Count -eq 0) {
  Fail 'forbiddenScope and verificationCommands must each contain at least one entry.'
}

$cliCandidates = @()
if (-not [string]::IsNullOrWhiteSpace([string]$env:CODEX_CLI_PATH)) {
  $cliCandidates += [string]$env:CODEX_CLI_PATH
}
$desktopCliRoot = Join-Path ([string]$env:LOCALAPPDATA) 'OpenAI\Codex\bin'
if (Test-Path -LiteralPath $desktopCliRoot -PathType Container) {
  $cliCandidates += @(Get-ChildItem -LiteralPath $desktopCliRoot -Filter 'codex.exe' -File -Recurse |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { $_.FullName })
}
$cli = @($cliCandidates | Where-Object {
  -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_ -PathType Leaf)
} | Select-Object -First 1)
if ($cli.Count -eq 0) {
  Fail 'Codex CLI is unavailable in CODEX_CLI_PATH and the desktop application directory. Return this task to Sol.' 4
}
$cli = [string]$cli[0]

$allowedText = if ($allowedFiles.Count -eq 0) { '- None (read-only task)' } else { ($allowedFiles | ForEach-Object { "- $_" }) -join "`n" }
$forbiddenText = ($forbiddenScope | ForEach-Object { "- $_" }) -join "`n"
$verificationText = ($verificationCommands | ForEach-Object { "- $_" }) -join "`n"
$prompt = @"
You are Luna Worker reporting to Sol. Execute only this converged task.

Objective: $objective
Repository root: $repositoryRoot

Allowed files:
$allowedText

Forbidden scope:
$forbiddenText

Verification commands:
$verificationText

Do not request permissions, broaden scope, delegate, release, delete, or perform external writes. If blocked, stop and report the exact blocker. Return outcome, actual changed files, command results, assumptions, and remaining risks. Sol will independently inspect and verify everything.
"@

$outputFile = Join-Path ([System.IO.Path]::GetTempPath()) ("luna-work-{0}.txt" -f [guid]::NewGuid())
& $cli exec --model gpt-5.6-luna --config 'model_reasoning_effort="max"' --config 'approval_policy="never"' --sandbox workspace-write --ephemeral --cd $workingDirectory --output-last-message $outputFile $prompt
$workerExitCode = $LASTEXITCODE
if ($workerExitCode -ne 0) {
  Fail "Luna CLI failed with exit code $workerExitCode. Return the task to Sol." $workerExitCode
}

$changedPaths = @(Get-ChangedPaths $repositoryRoot)
$outsideAllowlist = @($changedPaths | Where-Object { $allowedFiles -notcontains $_ })
if ($outsideAllowlist.Count -ne 0) {
  Fail ('Luna changed files outside allowedFiles: ' + ($outsideAllowlist -join ', ')) 5
}

if (Test-Path -LiteralPath $outputFile) {
  Get-Content -LiteralPath $outputFile -Raw -Encoding UTF8
}
Write-Output "LUNA_WORK_RESULT=$outputFile"
