# Repository Configuration Examples

このディレクトリには、`sks repo add`コマンドで追加できるカスタムリポジトリの設定例が含まれています。

## 使い方

### ローカルファイルから追加
```bash
# プロジェクト内に追加（.shulkers/repository/に保存）
sks repo add ./example-hangar.yml

# グローバルに追加（~/.shulkers/repository/に保存）
sks repo add ./example-hangar.yml --global
```

### URLから追加
```bash
# GitHub Rawや任意のURLから直接追加可能
sks repo add https://example.com/my-repo-config.yml
sks repo add https://raw.githubusercontent.com/user/repo/main/repository.yml --global
```

## 設定ファイルの構造

### 必須フィールド

```yaml
id: unique-repo-id          # リポジトリの一意なID
name: Repository Name       # 表示名
baseUrl: https://api.example.com  # APIのベースURL

searchPath: search?q={{query}}    # 検索エンドポイント
versionPath: plugins/{{id}}/latest  # バージョン情報エンドポイント

# オプション: ダウンロードエンドポイント
# 指定しない場合は versionMappings.downloadUrl から取得されます
downloadPath: plugins/{{id}}/download/{{version}}

mappings:
  resultsPath: ""           # 検索結果の配列へのパス（ルートが配列なら空文字）
  id: plugin_id             # プラグインIDのJSONパス
  name: plugin_name         # 名前のJSONパス
  description: desc         # 説明のJSONパス
  author: creator           # 作者のJSONパス

versionMappings:
  version: ver              # バージョン番号のJSONパス
  downloadUrl: download_url # ダウンロードURLのJSONパス
  fileName: file_name       # ファイル名のJSONパス（省略可）
```

### プレースホルダー

エンドポイントパスで使用できるプレースホルダー：

- **`{{query}}`** - 検索クエリに置き換えられます（searchPathで使用）
- **`{{id}}`** - プラグイン/ModのIDに置き換えられます（versionPath、downloadPathで使用）
- **`{{version}}`** - バージョン番号に置き換えられます（downloadPathで使用）
- **`{{fileName}}`** - ファイル名に置き換えられます（downloadPathで使用）

### ダウンロードエンドポイント（downloadPath）

`downloadPath`は省略可能です。指定方法は2つあります：

1. **downloadPathを使用する場合**（推奨）:
   ```yaml
   downloadPath: plugins/{{id}}/download/{{version}}
   # または絶対URL
   downloadPath: https://cdn.example.com/files/{{fileName}}
   ```
   - プレースホルダーが自動的に置換されます
   - 相対パスの場合は`baseUrl`が自動的に付加されます
   - 絶対URL（http://またはhttps://で始まる）の場合はそのまま使用されます

2. **versionMappingsのdownloadUrlを使用する場合**:
   ```yaml
   versionMappings:
     downloadUrl: download.url  # APIレスポンスからダウンロードURLを抽出
   ```
   - APIレスポンスにダウンロードURLが含まれている場合に使用
   - JSONパスで指定します

### JSONパスの記法

ドット記法を使用してネストされたフィールドにアクセスできます：

```yaml
# 例: { "data": { "items": [{ "info": { "name": "MyPlugin" } }] } }
resultsPath: data.items
name: info.name

# 配列のインデックスも使用可能
# 例: { "authors": [{ "name": "John" }] }
author: authors.0.name
```

## サンプルファイル

- **example-simple.yml** - 最小限の設定例
- **example-hangar.yml** - Hangar (PaperMC) リポジトリの例
- **example-curseforge.yml** - CurseForge リポジトリの例

## ビルトインリポジトリ

Shulkersには以下のリポジトリが組み込まれています：

- **Spiget** (`spiget`) - SpigotMC プラグインリポジトリ
- **Modrinth** (`modrinth`) - Modrinth プラグイン/Modリポジトリ

これらは追加不要で、すぐに使用できます。

## リポジトリの確認

追加したリポジトリを確認するには：

```bash
# すべてのリポジトリを表示
sks repo list

# グローバルリポジトリのみ
sks repo list --global

# ローカルリポジトリのみ
sks repo list --local
```

## リポジトリの削除

```bash
# ローカルリポジトリを削除
sks repo remove <repo-id>

# グローバルリポジトリを削除
sks repo remove <repo-id> --global
```
