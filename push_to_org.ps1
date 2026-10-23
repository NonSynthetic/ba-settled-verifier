# push_to_org.ps1 — last-mile for task_RB872 once the nonsynthetic PAT exists.
# Prereq: `gh auth login` as the `nonsynthetic` account (repo,workflow scopes)
#   or `gh auth token` env GH_TOKEN set for that account.
# Run: powershell -NoProfile -File push_to_org.ps1
$ErrorActionPreference = "Stop"
$Org  = "NonSynthetic"
$Repo = "ba-settled-verifier"
$Dir  = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $Dir
$who = gh api user --jq .login
Write-Host "gh acting as: $who"
if ($who -ne "nonsynthetic") {
  Write-Host "WARN: gh is '$who', not 'nonsynthetic' — repo will exist under a non-clean identity. Ctrl+C to abort, Enter to continue anyway."
  Read-Host | Out-Null
}

gh repo create "$Org/$Repo" --public `
  --description "Nightly independent verification of the BasedAgents settled-payments feed" `
  2>$null; if ($LASTEXITCODE -ne 0) { Write-Host "repo may already exist — continuing" }

git remote remove origin 2>$null
git remote add origin "https://github.com/$Org/$Repo.git"
git branch -M main
git push -u origin main

# repo variables consumed by the workflow
gh variable set SAMPLE_URL        --repo "$Org/$Repo" `
  --body "https://api.basedagents.ai/v1/tasks/task_9Jwd52CoRIkV3kKfF6Oor"
gh variable set EXPECTED_SHA256   --repo "$Org/$Repo" `
  --body "148a2e1ed6914e8139eb6eb98f2416054ba96bb807670b1b48ee46ab870daa71"

# first live run now, not tonight
gh workflow run nightly-verify.yml --repo "$Org/$Repo"
Start-Sleep 20
gh run list --repo "$Org/$Repo" --limit 1
Write-Host "Done — check https://github.com/$Org/$Repo/actions for the live run log."
