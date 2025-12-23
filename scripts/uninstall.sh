#!/bin/bash
# Shulkers - Minecraft Server Plugin Manager
# Uninstallation Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/uninstall.sh | bash
#
# This script removes the Shulkers CLI tool from your system.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${SHULKERS_INSTALL:-$HOME/.shulkers}"
BIN_DIR="${SHULKERS_BIN:-$HOME/.local/bin}"
GLOBAL_CONFIG_DIR="$HOME/.shulkers"

print_header() {
    echo -e "${RED}"
    echo "  ____  _           _ _                   "
    echo " / ___|| |__  _   _| | | _____ _ __ ___  "
    echo " \___ \| '_ \| | | | | |/ / _ \ '__/ __| "
    echo "  ___) | | | | |_| | |   <  __/ |  \__ \ "
    echo " |____/|_| |_|\__,_|_|_|\_\___|_|  |___/ "
    echo -e "${NC}"
    echo -e "${YELLOW}Uninstaller${NC}"
    echo ""
}

info() {
    echo -e "${CYAN}info${NC}: $1"
}

warn() {
    echo -e "${YELLOW}warn${NC}: $1"
}

error() {
    echo -e "${RED}error${NC}: $1"
    exit 1
}

success() {
    echo -e "${GREEN}✔${NC} $1"
}

confirm_uninstall() {
    echo -e "${YELLOW}This will remove Shulkers from your system.${NC}"
    echo ""
    echo -e "${CYAN}The following will be removed:${NC}"
    echo "  - ${INSTALL_DIR}/shulkers"
    echo "  - ${BIN_DIR}/sks"
    echo "  - ${BIN_DIR}/shulkers"
    echo ""
    
    read -p "Continue? [y/N] " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 1
    fi
    return 0
}

remove_binaries() {
    local files_to_remove=(
        "${INSTALL_DIR}/shulkers"
        "${BIN_DIR}/sks"
        "${BIN_DIR}/shulkers"
    )
    
    for file in "${files_to_remove[@]}"; do
        if [[ -e "$file" ]] || [[ -L "$file" ]]; then
            rm -f "$file"
            success "Removed $file"
        fi
    done
    
    # Remove install directory if empty
    if [[ -d "$INSTALL_DIR" ]] && [[ -z "$(ls -A "$INSTALL_DIR")" ]]; then
        rmdir "$INSTALL_DIR"
        success "Removed empty directory $INSTALL_DIR"
    fi
}

remove_from_shell_config() {
    local shell_configs=(
        "$HOME/.bashrc"
        "$HOME/.bash_profile"
        "$HOME/.zshrc"
        "$HOME/.profile"
    )
    
    for config in "${shell_configs[@]}"; do
        if [[ -f "$config" ]]; then
            # Remove Shulkers-related lines
            if grep -q "# Shulkers" "$config" 2>/dev/null; then
                # Create backup
                cp "$config" "${config}.bak"
                
                # Remove Shulkers section (comment and PATH line)
                sed -i.tmp '/# Shulkers/d' "$config"
                sed -i.tmp '/\.local\/bin/d' "$config"
                rm -f "${config}.tmp"
                
                success "Cleaned PATH from $config"
            fi
        fi
    done
}

remove_global_config() {
    if [[ -d "$GLOBAL_CONFIG_DIR" ]]; then
        echo ""
        read -p "Remove global configuration directory ($GLOBAL_CONFIG_DIR)? [y/N] " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$GLOBAL_CONFIG_DIR"
            success "Removed global configuration directory"
        else
            info "Kept global configuration directory"
        fi
    fi
}

main() {
    print_header
    
    if ! confirm_uninstall; then
        echo ""
        echo -e "${YELLOW}Uninstallation cancelled.${NC}"
        exit 0
    fi
    
    echo ""
    info "Uninstalling Shulkers..."
    
    remove_binaries
    remove_from_shell_config
    remove_global_config
    
    echo ""
    success "Shulkers has been uninstalled!"
    echo ""
    echo -e "${CYAN}Thank you for using Shulkers. We hope to see you again!${NC}"
}

main "$@"
