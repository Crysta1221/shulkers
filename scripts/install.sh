#!/bin/bash
# Shulkers - Minecraft Server Plugin Manager
# Installation Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.sh | bash -s -- --global
#
# This script downloads and installs the Shulkers CLI tool.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO="Crysta1221/shulkers"
INSTALL_DIR="${SHULKERS_INSTALL:-$HOME/.shulkers}"
BIN_DIR="${SHULKERS_BIN:-$HOME/.local/bin}"
GLOBAL_INSTALL=false
SUDO=""

print_usage() {
    cat >&2 << 'EOF'
Usage:
  install.sh [--global]

Options:
  --global, -g   Install for all users (Linux only). Uses /usr/local by default.
  --help, -h     Show this help.

Examples:
  curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.sh | bash -s -- --global
EOF
}

setup_global_install() {
    GLOBAL_INSTALL=true

    if [[ "$1" == "windows-x64" ]]; then
        error "--global is not supported on Windows. Use the default per-user install instead."
    fi

    # Only apply defaults if env vars are not set.
    if [[ -z "${SHULKERS_INSTALL:-}" ]]; then
        INSTALL_DIR="/usr/local/share/shulkers"
    fi
    if [[ -z "${SHULKERS_BIN:-}" ]]; then
        BIN_DIR="/usr/local/bin"
    fi

    # Use sudo if needed.
    if [[ "$(id -u)" -ne 0 ]]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            error "Global install requires root privileges. Re-run as root or install sudo."
        fi
    fi
}

print_header() {
    echo -e "${GREEN}" >&2
    echo "  ____  _           _ _                   " >&2
    echo " / ___|| |__  _   _| | | _____ _ __ ___  " >&2
    echo " \___ \| '_ \| | | | | |/ / _ \ '__/ __| " >&2
    echo "  ___) | | | | |_| | |   <  __/ |  \__ \ " >&2
    echo " |____/|_| |_|\__,_|_|_|\_\___|_|  |___/ " >&2
    echo -e "${NC}" >&2
    echo -e "${CYAN}📦 Minecraft Server Plugin Manager${NC}" >&2
    echo "" >&2
}

info() {
    echo -e "${CYAN}info${NC}: $1" >&2
}

warn() {
    echo -e "${YELLOW}warn${NC}: $1" >&2
}

error() {
    echo -e "${RED}error${NC}: $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✔${NC} $1" >&2
}

detect_platform() {
    local os arch

    # Detect OS
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        CYGWIN*|MINGW*|MSYS*) os="windows" ;;
        *)          error "Unsupported operating system: $(uname -s)" ;;
    esac

    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        aarch64|arm64)  arch="arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac

    # Check for supported combinations
    if [[ "$os" == "darwin" ]]; then
        error "macOS is not yet supported. Please build from source."
    fi

    if [[ "$os" == "windows" ]]; then
        echo "windows-x64"
    else
        echo "${os}-${arch}"
    fi
}

get_latest_version() {
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [[ -z "$version" ]]; then
        error "Failed to fetch latest version. Check your internet connection."
    fi
    
    echo "$version"
}

download_binary() {
    local platform="$1"
    local version="$2"
    local filename="shulkers-${platform}"
    local url="https://github.com/${REPO}/releases/download/${version}/${filename}"
    local target="${INSTALL_DIR}/shulkers"
    local tmp=""

    # Add .exe extension for Windows
    if [[ "$platform" == "windows-x64" ]]; then
        filename="${filename}.exe"
        url="https://github.com/${REPO}/releases/download/${version}/${filename}"
        target="${INSTALL_DIR}/shulkers.exe"
    fi

    info "Downloading Shulkers ${version} for ${platform}..."

    tmp="$(mktemp)"

    # Download to a temp file first (works even when target requires root).
    if ! curl -fsSL "$url" -o "$tmp" 2>/dev/null; then
        rm -f "$tmp" >/dev/null 2>&1 || true
        error "Failed to download from ${url}"
    fi

    # Create install directory and move into place
    ${SUDO} mkdir -p "$INSTALL_DIR"
    ${SUDO} mv "$tmp" "$target"

    # Make executable (Linux only)
    if [[ "$platform" != "windows-x64" ]]; then
        ${SUDO} chmod +x "$target"
    fi

    echo "$target"
}

install_binary() {
    local binary_path="$1"
    local platform="$2"

    # Create bin directory
    ${SUDO} mkdir -p "$BIN_DIR"

    # Create symlink or copy
    if [[ "$platform" == "windows-x64" ]]; then
        # On Windows (Git Bash/MSYS), just copy
        cp "$binary_path" "${BIN_DIR}/sks.exe"
        success "Installed to ${BIN_DIR}/sks.exe"
    else
        # On Linux/macOS, create symlinks
        ${SUDO} ln -sf "$binary_path" "${BIN_DIR}/sks"
        ${SUDO} ln -sf "$binary_path" "${BIN_DIR}/shulkers"
        success "Installed to ${BIN_DIR}/sks"
    fi
}

add_to_path() {
    local shell_config=""
    local path_line="export PATH=\"\$HOME/.local/bin:\$PATH\""

    # Global installs typically use /usr/local/bin which is already on PATH.
    if [[ "$GLOBAL_INSTALL" == true ]]; then
        return
    fi

    # Detect shell configuration file
    if [[ -n "$BASH_VERSION" ]]; then
        if [[ -f "$HOME/.bashrc" ]]; then
            shell_config="$HOME/.bashrc"
        elif [[ -f "$HOME/.bash_profile" ]]; then
            shell_config="$HOME/.bash_profile"
        fi
    elif [[ -n "$ZSH_VERSION" ]]; then
        shell_config="$HOME/.zshrc"
    fi

    # Check if PATH already includes the bin directory
    if [[ ":$PATH:" == *":$BIN_DIR:"* ]]; then
        return
    fi

    if [[ -n "$shell_config" ]]; then
        # Check if already added
        if ! grep -q ".local/bin" "$shell_config" 2>/dev/null; then
            echo "" >> "$shell_config"
            echo "# Shulkers" >> "$shell_config"
            echo "$path_line" >> "$shell_config"
            warn "Added ${BIN_DIR} to PATH in ${shell_config}"
            warn "Run 'source ${shell_config}' or restart your terminal to use 'sks'"
        fi
    else
        warn "Could not detect shell config. Add ${BIN_DIR} to your PATH manually."
    fi
}

verify_installation() {
    local binary_path="$1"
    
    if [[ -x "$binary_path" ]] || [[ -f "$binary_path" ]]; then
        success "Installation complete!"
        echo ""
        echo -e "Run ${GREEN}sks --help${NC} to get started"
        echo -e "Or ${GREEN}sks init${NC} in your Minecraft server directory"
    else
        error "Installation verification failed"
    fi
}

main() {
    print_header

    # Detect platform early so we can validate flags.
    info "Detecting platform..."
    local platform
    platform=$(detect_platform)
    success "Platform: ${platform}"

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --global|-g)
                setup_global_install "$platform"
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

    # Get latest version
    info "Fetching latest version..."
    local version
    version=$(get_latest_version)
    success "Latest version: ${version}"

    # Download binary
    local binary_path
    binary_path=$(download_binary "$platform" "$version")
    success "Downloaded to ${binary_path}"

    # Install to bin directory
    install_binary "$binary_path" "$platform"

    # Add to PATH if needed
    add_to_path

    # Verify
    verify_installation "$binary_path"
}

main "$@"
