# Shulkers - Minecraft Server Plugin Manager
# Uninstallation Script for Windows PowerShell
#
# Usage:
#   irm https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/uninstall.ps1 | iex
#
# This script removes the Shulkers CLI tool from your system.

$ErrorActionPreference = "Stop"

# Configuration
$InstallDir = if ($env:SHULKERS_INSTALL) { $env:SHULKERS_INSTALL } else { "$env:LOCALAPPDATA\shulkers" }
$BinDir = if ($env:SHULKERS_BIN) { $env:SHULKERS_BIN } else { "$env:LOCALAPPDATA\shulkers\bin" }
$GlobalConfigDir = "$env:USERPROFILE\.shulkers"

function Write-Header {
    Write-Host ""
    Write-Host "  ____  _           _ _                   " -ForegroundColor Red
    Write-Host " / ___|| |__  _   _| | | _____ _ __ ___  " -ForegroundColor Red
    Write-Host " \___ \| '_ \| | | | | |/ / _ \ '__/ __| " -ForegroundColor Red
    Write-Host "  ___) | | | | |_| | |   <  __/ |  \__ \ " -ForegroundColor Red
    Write-Host " |____/|_| |_|\__,_|_|_|\_\___|_|  |___/ " -ForegroundColor Red
    Write-Host ""
    Write-Host "Uninstaller" -ForegroundColor Yellow
    Write-Host ""
}

function Write-Info {
    param([string]$Message)
    Write-Host "info: " -NoNewline -ForegroundColor Cyan
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "✔ " -NoNewline -ForegroundColor Green
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "warn: " -NoNewline -ForegroundColor Yellow
    Write-Host $Message
}

function Remove-FromPath {
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($CurrentPath -like "*$BinDir*") {
        $NewPath = ($CurrentPath -split ";" | Where-Object { $_ -ne $BinDir }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        Write-Success "Removed $BinDir from PATH"
    }
}

function Remove-Binaries {
    $FilesToRemove = @(
        "$InstallDir\shulkers.exe",
        "$BinDir\sks.exe",
        "$BinDir\shulkers.exe"
    )
    
    foreach ($File in $FilesToRemove) {
        if (Test-Path $File) {
            Remove-Item $File -Force
            Write-Success "Removed $File"
        }
    }
    
    # Remove bin directory if empty
    if ((Test-Path $BinDir) -and ((Get-ChildItem $BinDir).Count -eq 0)) {
        Remove-Item $BinDir -Force
        Write-Success "Removed empty directory $BinDir"
    }
    
    # Remove install directory if empty
    if ((Test-Path $InstallDir) -and ((Get-ChildItem $InstallDir).Count -eq 0)) {
        Remove-Item $InstallDir -Force
        Write-Success "Removed empty directory $InstallDir"
    }
}

function Remove-GlobalConfig {
    if (Test-Path $GlobalConfigDir) {
        $Response = Read-Host "Remove global configuration directory ($GlobalConfigDir)? [y/N]"
        
        if ($Response -eq "y" -or $Response -eq "Y") {
            Remove-Item $GlobalConfigDir -Recurse -Force
            Write-Success "Removed global configuration directory"
        } else {
            Write-Info "Kept global configuration directory"
        }
    }
}

function Confirm-Uninstall {
    Write-Host "This will remove Shulkers from your system." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The following will be removed:" -ForegroundColor Cyan
    Write-Host "  - $InstallDir\shulkers.exe"
    Write-Host "  - $BinDir\sks.exe"
    Write-Host "  - PATH entry for $BinDir"
    Write-Host ""
    
    $Response = Read-Host "Continue? [y/N]"
    return ($Response -eq "y" -or $Response -eq "Y")
}

# Main
try {
    Write-Header
    
    if (-not (Confirm-Uninstall)) {
        Write-Host ""
        Write-Host "Uninstallation cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Info "Uninstalling Shulkers..."
    
    Remove-Binaries
    Remove-FromPath
    Remove-GlobalConfig
    
    Write-Host ""
    Write-Success "Shulkers has been uninstalled!"
    Write-Host ""
    Write-Host "Thank you for using Shulkers. We hope to see you again!" -ForegroundColor Cyan
}
catch {
    Write-Host "error: $_" -ForegroundColor Red
    exit 1
}
