<div align="center">

# 📦 Shulkers

**A modern CLI tool for managing Minecraft server plugins and mods**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Bun](https://img.shields.io/badge/Bun-%23000000.svg?logo=bun&logoColor=white)](https://bun.sh) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Installation](#installation) • [Quick Start](#quick-start) • [Commands](#commands) • [Configuration](#configuration) • [Contributing](#contributing)

</div>

---

## ✨ Features

- 🔍 **Search** - Find plugins across Modrinth, Spigot, and GitHub
- 📥 **Install** - Download and install plugins with a single command
- 🔄 **Update** - Keep your plugins up to date with smart version management
- 📋 **Track** - Manage dependencies in a simple `project.yml` file
- 🔌 **Multi-source** - Support for Modrinth, SpigotMC, and GitHub releases
- ⚡ **Fast** - Built with Bun for blazing fast performance

## 📋 Requirements

- [Bun](https://bun.sh) v1.0 or later
- A Minecraft server (Paper, Spigot, Purpur, Velocity, etc.)

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/shulkers.git
cd shulkers

# Install dependencies
bun install

# Link globally
bun link
```

## 🏁 Quick Start

```bash
# Navigate to your Minecraft server directory
cd /path/to/your/server

# Initialize a new Shulkers project
sks init

# Search for a plugin
sks search viaversion

# Install plugins
sks add modrinth:viaversion modrinth:viabackwards

# Check for updates
sks outdated

# Update all plugins
sks update
```

## 📖 Commands

### Project Management

| Command | Description |
|---------|-------------|
| `sks init` | Initialize a new Shulkers project |
| `sks list` | List installed plugins/mods |
| `sks scan` | Scan and register existing plugins |

### Plugin Management

| Command | Description |
|---------|-------------|
| `sks search <query>` | Search for plugins across repositories |
| `sks info <plugin>` | Show detailed information about a plugin |
| `sks install <plugin...>` | Install plugin(s) from project.yml |
| `sks add <plugin...>` | Add and install plugin(s) |
| `sks remove <plugin...>` | Remove installed plugin(s) |

### Updates

| Command | Description |
|---------|-------------|
| `sks outdated` | Check for outdated plugins |
| `sks update` | Update to latest minor versions |
| `sks update --latest` | Update to latest versions |
| `sks update --latest --safe` | Update only if server compatible |

### Repository Management

| Command | Description |
|---------|-------------|
| `sks repo list` | List configured repositories |
| `sks repo add <name> <url>` | Add a custom repository |
| `sks repo remove <name>` | Remove a repository |

## 📦 Plugin Sources

Shulkers supports multiple plugin sources:

### Modrinth
```bash
sks add modrinth:viaversion
sks add modrinth:viaversion@5.0.0
```

### SpigotMC
```bash
sks add spigot:vault
sks add spigot:19254  # Using resource ID
```

### GitHub
```bash
sks add github:ViaVersion/ViaVersion
```

## ⚙️ Configuration

### Project Configuration

Shulkers stores project configuration in `.shulkers/project.yml`:

```yaml
name: my-server
description: My Minecraft Server
serverType: plugin
server:
  type: paper
  version: "1.21"
  memory:
    min: 2G
    max: 4G
dependencies:
  ViaVersion:
    source: modrinth
    id: viaversion
    version: 5.0.0
    fileName: ViaVersion-5.0.0.jar
```

### Global Configuration

Global settings are stored in:
- **Linux/macOS**: `~/.config/shulkers/`
- **Windows**: `%APPDATA%\shulkers\`

## 🔧 Development

```bash
# Run in development
bun run src/index.ts <command>

# Type checking
bunx tsc --noEmit

# Linting
bunx oxlint --type-aware
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Modrinth](https://modrinth.com) - For their amazing mod platform and API
- [SpigotMC](https://spigotmc.org) - For the Spiget API
- [Bun](https://bun.sh) - For the fast JavaScript runtime

---

<div align="center">
Made with ❤️ for the Minecraft community
</div>
