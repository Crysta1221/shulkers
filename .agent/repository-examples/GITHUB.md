# GitHub Repository Integration Guide

ShulkersはGitHub Releasesから直接プラグイン/Modをダウンロードできます。

## 使い方

### GitHubリポジトリの追加

```bash
# GitHubのリポジトリURLを指定するだけ
sks repo add https://github.com/PaperMC/Paper

# プロジェクト名を入力するプロンプトが表示されます
# デフォルトはリポジトリ名（この場合は "Paper"）

# グローバルに追加する場合
sks repo add https://github.com/PaperMC/Velocity --global
```

### 自動検出機能

`sks repo add`コマンドは、URLがGitHubリポジトリかどうかを自動的に検出します：

- **GitHubのURL**: `github.yml`に追加され、GitHub Releasesから取得
- **その他のURL/ファイル**: 通常のリポジトリ設定として処理

### プロジェクト名のカスタマイズ

GitHubリポジトリを追加する際、プロジェクト名を指定できます：

```bash
$ sks repo add https://github.com/username/my-plugin
Detected GitHub repository URL!
? Enter a display name for this project: (my-plugin) My Awesome Plugin
? Add My Awesome Plugin (https://github.com/username/my-plugin) to github.yml? (Y/n) y
✔ GitHub repository 'My Awesome Plugin' added locally!
  URL: https://github.com/username/my-plugin
  Saved to: github.yml
```

## github.ymlの構造

GitHubリポジトリは`github.yml`ファイルで管理されます：

```yaml
repositories:
  - url: https://github.com/PaperMC/Paper
    name: Paper Server
  
  - url: https://github.com/PaperMC/Velocity
    name: Velocity Proxy
```

### フィールド説明

- **`url`** (必須): GitHubリポジトリのURL
- **`name`** (必須): プロジェクトの表示名

## 保存場所

- **ローカル**: `.shulkers/repository/github.yml`
- **グローバル**: `~/.shulkers/repository/github.yml`

## リポジトリの確認

```bash
# すべてのリポジトリを表示（GitHubリポジトリも含む）
sks repo list

# 出力例:
# Built-in Repositories:
#   - Spiget (SpigotMC) (spiget)
#   - Modrinth (modrinth)
#
# Global GitHub Repositories:
#   - Paper Server: https://github.com/PaperMC/Paper
#   - Velocity Proxy: https://github.com/PaperMC/Velocity
```

## ダウンロードの仕組み

1. **最新リリースの取得**: GitHub APIを使用して最新リリースを取得
2. **JARファイルの検索**: リリースのアセットから`.jar`ファイルを検索
3. **ダウンロード**: 見つかった`.jar`ファイルをダウンロード

### 要件

- リポジトリに少なくとも1つのリリースが存在すること
- リリースに`.jar`ファイルのアセットが含まれていること

## 手動編集

`github.yml`ファイルを直接編集することもできます：

```yaml
repositories:
  - url: https://github.com/owner/repo1
    name: Project 1
  - url: https://github.com/owner/repo2
    name: Project 2
```

編集後、次回の`sks`コマンド実行時に自動的に読み込まれます。

## トラブルシューティング

### リリースが見つからない

```
Error: No .jar file found in latest release for owner/repo
```

**解決方法**:
- リポジトリにリリースが存在するか確認
- 最新リリースに`.jar`ファイルが含まれているか確認

### 重複エラー

```
Error: GitHub repository https://github.com/owner/repo already exists.
```

**解決方法**:
- `sks repo list`で既存のリポジトリを確認
- 必要に応じて`github.yml`から削除して再追加

## 例

### よく使われるGitHubリポジトリ

```bash
# Paper Server
sks repo add https://github.com/PaperMC/Paper --global

# Velocity Proxy
sks repo add https://github.com/PaperMC/Velocity --global

# Geyser (Bedrock support)
sks repo add https://github.com/GeyserMC/Geyser --global

# Floodgate
sks repo add https://github.com/GeyserMC/Floodgate --global
```

これらのリポジトリは、GitHub Releasesから最新版を自動的に取得できます!
