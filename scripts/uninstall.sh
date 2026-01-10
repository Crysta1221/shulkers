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
GLOBAL_UNINSTALL=false
SUDO=""
ASSUME_YES=false

is_unsafe_path() {
    local p="$1"

    # Empty / root / current / parent are always unsafe.
    if [[ -z "$p" ]] || [[ "$p" == "/" ]] || [[ "$p" == "." ]] || [[ "$p" == ".." ]]; then
        return 0
    fi

    return 1
}

require_safe_path() {
    local p="$1"
    local label="$2"

    if is_unsafe_path "$p"; then
        error "Refusing to operate on unsafe path for ${label}: '${p}'"
    fi
}

print_usage() {
    cat >&2 << 'EOF'
Usage:
    uninstall.sh [--global] [--yes]

Options:
  --global, -g   Uninstall a global install (Linux only). Uses /usr/local by default.
    --yes, -y      Assume "yes" for the main uninstall prompt (useful for non-interactive runs).
  --help, -h     Show this help.

Examples:
  curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/uninstall.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/uninstall.sh | bash -s -- --global
    curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/uninstall.sh | bash -s -- --global --yes
EOF
}

prompt_yes_no() {
    local prompt="$1"
    local default_no="${2:-true}"

    if [[ "$ASSUME_YES" == true ]]; then
        return 0
    fi

    local reply=""
    local input_hint="[y/N]"
    if [[ "$default_no" != true ]]; then
        input_hint="[Y/n]"
    fi

    # When executed via a pipe (curl | bash), stdin is not a TTY.
    # Prefer reading from /dev/tty so the user can still answer.
    if [[ -t 0 ]]; then
        read -p "${prompt} ${input_hint} " -n 1 -r
        echo ""
        reply="$REPLY"
    elif [[ -r /dev/tty ]]; then
        read -p "${prompt} ${input_hint} " -n 1 -r < /dev/tty
        echo "" > /dev/tty
        reply="$REPLY"
    else
        error "Non-interactive shell detected. Re-run with --yes to proceed."
    fi

    if [[ -z "$reply" ]]; then
        if [[ "$default_no" == true ]]; then
            return 1
        fi
        return 0
    fi

    if [[ "$reply" =~ ^[Yy]$ ]]; then
        return 0
    fi
    return 1
}

setup_global_uninstall() {
    GLOBAL_UNINSTALL=true

    if [[ "$1" == "windows-x64" ]]; then
        error "--global is not supported on Windows. Use the default per-user uninstall instead."
    fi

    if [[ -z "${SHULKERS_INSTALL:-}" ]]; then
        INSTALL_DIR="/usr/local/share/shulkers"
    fi
    if [[ -z "${SHULKERS_BIN:-}" ]]; then
        BIN_DIR="/usr/local/bin"
    fi

    if [[ "$(id -u)" -ne 0 ]]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            error "Global uninstall requires root privileges. Re-run as root or install sudo."
        fi
    fi
}

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
    if prompt_yes_no "Continue?" true; then
        return 0
    fi
    return 1
}

remove_binaries() {
    local files_to_remove=(
        "${INSTALL_DIR}/shulkers"
        "${BIN_DIR}/sks"
        "${BIN_DIR}/shulkers"
    )
    
    for file in "${files_to_remove[@]}"; do
        require_safe_path "$file" "file removal"
        if [[ -e "$file" ]] || [[ -L "$file" ]]; then
            ${SUDO} rm -f "$file"
            success "Removed $file"
        fi
    done
    
    # Remove install directory if empty
    require_safe_path "$INSTALL_DIR" "install dir"
    if [[ -d "$INSTALL_DIR" ]] && [[ -z "$(ls -A "$INSTALL_DIR")" ]]; then
        ${SUDO} rmdir "$INSTALL_DIR"
        success "Removed empty directory $INSTALL_DIR"
    fi
}

remove_from_shell_config() {
    if [[ "$GLOBAL_UNINSTALL" == true ]]; then
        return
    fi

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
        # In non-interactive mode, keep configs by default for safety.
        if prompt_yes_no "Remove global configuration directory ($GLOBAL_CONFIG_DIR)?" true; then
            require_safe_path "$GLOBAL_CONFIG_DIR" "global config dir"
            rm -rf "$GLOBAL_CONFIG_DIR"
            success "Removed global configuration directory"
        else
            info "Kept global configuration directory"
        fi
    fi
}

main() {
    print_header

    # Detect platform early so we can validate flags.
    local platform=""
    case "$(uname -s)" in
        Linux*) platform="linux" ;;
        Darwin*) platform="darwin" ;;
        CYGWIN*|MINGW*|MSYS*) platform="windows-x64" ;;
        *) platform="" ;;
    esac

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --global|-g)
                setup_global_uninstall "$platform"
                ;;
            --yes|-y)
                ASSUME_YES=true
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                error "Unknown argument: $1"
                ;;
        esac
        shift
    done
    
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
