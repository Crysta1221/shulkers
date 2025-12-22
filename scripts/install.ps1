# Shulkers - Minecraft Server Plugin Manager
# Installation Script for Windows PowerShell
#
# Usage:
#   irm https://raw.githubusercontent.com/Crysta1221/shulkers/main/install.ps1 | iex
#
# This script downloads and installs the Shulkers CLI tool.

$ErrorActionPreference = "Stop"

# Configuration
$Repo = "Crysta1221/shulkers"
$InstallDir = if ($env:SHULKERS_INSTALL) { $env:SHULKERS_INSTALL } else { "$env:LOCALAPPDATA\shulkers" }
$BinDir = if ($env:SHULKERS_BIN) { $env:SHULKERS_BIN } else { "$env:LOCALAPPDATA\shulkers\bin" }

function Write-Header {
    Write-Host ""
    Write-Host "  ____  _           _ _                   " -ForegroundColor Green
    Write-Host " / ___|| |__  _   _| | | _____ _ __ ___  " -ForegroundColor Green
    Write-Host " \___ \| '_ \| | | | | |/ / _ \ '__/ __| " -ForegroundColor Green
    Write-Host "  ___) | | | | |_| | |   <  __/ |  \__ \ " -ForegroundColor Green
    Write-Host " |____/|_| |_|\__,_|_|_|\_\___|_|  |___/ " -ForegroundColor Green
    Write-Host ""
    Write-Host "📦 Minecraft Server Plugin Manager" -ForegroundColor Cyan
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

function Get-LatestVersion {
    Write-Info "Fetching latest version..."
    
    try {
        $Response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
        $Version = $Response.tag_name
        
        if (-not $Version) {
            throw "Could not determine latest version"
        }
        
        Write-Success "Latest version: $Version"
        return $Version
    }
    catch {
        throw "Failed to fetch latest version: $_"
    }
}

function Install-Shulkers {
    param([string]$Version)
    
    $FileName = "shulkers-windows-x64.exe"
    $Url = "https://github.com/$Repo/releases/download/$Version/$FileName"
    $TempPath = "$env:TEMP\$FileName"
    $BinaryPath = "$InstallDir\shulkers.exe"
    
    Write-Info "Downloading Shulkers $Version..."
    
    # Create directories
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    
    # Download binary
    try {
        Invoke-WebRequest -Uri $Url -OutFile $TempPath -UseBasicParsing
    }
    catch {
        throw "Failed to download from $Url : $_"
    }
    
    # Move to install directory
    Move-Item -Path $TempPath -Destination $BinaryPath -Force
    Write-Success "Downloaded to $BinaryPath"
    
    # Copy to bin directory with alias
    Copy-Item -Path $BinaryPath -Destination "$BinDir\sks.exe" -Force
    Write-Success "Installed to $BinDir\sks.exe"
    
    return $BinaryPath
}

function Add-ToPath {
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($CurrentPath -notlike "*$BinDir*") {
        $NewPath = "$CurrentPath;$BinDir"
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        $env:Path = "$env:Path;$BinDir"
        Write-Warning "Added $BinDir to PATH"
        Write-Warning "Restart your terminal for the changes to take effect"
    }
}

function Test-Installation {
    param([string]$BinaryPath)
    
    if (Test-Path $BinaryPath) {
        Write-Success "Installation complete!"
        Write-Host ""
        Write-Host "Run " -NoNewline
        Write-Host "sks --help" -NoNewline -ForegroundColor Green
        Write-Host " to get started"
        Write-Host "Or " -NoNewline
        Write-Host "sks init" -NoNewline -ForegroundColor Green
        Write-Host " in your Minecraft server directory"
    }
    else {
        throw "Installation verification failed"
    }
}

# Main
try {
    Write-Header
    
    Write-Info "Platform: windows-x64"
    
    $Version = Get-LatestVersion
    $BinaryPath = Install-Shulkers -Version $Version
    
    Add-ToPath
    Test-Installation -BinaryPath $BinaryPath
}
catch {
    Write-Host "error: $_" -ForegroundColor Red
    exit 1
}
