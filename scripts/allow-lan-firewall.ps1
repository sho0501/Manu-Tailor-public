#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$ruleName = 'Manu-Tailor LAN API'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Host 'Manu-Tailor API port 8000 is allowed from the local subnet.'
