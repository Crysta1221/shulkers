import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { repositoryManager } from "./repositories/manager";
import type { GenericRepositoryConfig } from "./repositories/generic";
import type {
  GitHubRepositoriesConfig,
  GitHubRepoEntry,
} from "./repositories/github";
import { GitHubRepository } from "./repositories/github";
import {
  getLocalRepositoryDir,
  getGlobalRepositoryDir,
  ensureDir,
  isProjectInitialized,
} from "./paths";

/**
 * Load all repositories from both local and global directories.
 */
export function loadRepositories(): void {
  const configs: GenericRepositoryConfig[] = [];
  const githubRepos: GitHubRepoEntry[] = [];

  // Load global repositories first
  const globalDir = getGlobalRepositoryDir();
  if (existsSync(globalDir)) {
    configs.push(...readRepositoriesFromDir(globalDir));
    githubRepos.push(...readGitHubRepos(globalDir));
  }

  // Load local repositories (override global if same id)
  if (isProjectInitialized()) {
    const localDir = getLocalRepositoryDir();
    if (existsSync(localDir)) {
      configs.push(...readRepositoriesFromDir(localDir));
      githubRepos.push(...readGitHubRepos(localDir));
    }
  }

  // Register all loaded repositories
  if (configs.length > 0) {
    repositoryManager.loadFromConfig(configs);
  }

  // Register GitHub repositories
  if (githubRepos.length > 0) {
    const githubRepo = new GitHubRepository(githubRepos);
    repositoryManager.addRepository(githubRepo);
  }
}

/**
 * Read all repository configurations from a directory.
 * @param dirPath Path to the repository directory
 */
function readRepositoriesFromDir(dirPath: string): GenericRepositoryConfig[] {
  const configs: GenericRepositoryConfig[] = [];
  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const filePath = join(dirPath, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const config = parse(content) as GenericRepositoryConfig;
        if (config.id && config.name && config.baseUrl) {
          configs.push(config);
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Ignore read errors
  }
  return configs;
}

/**
 * Save a repository configuration to a file.
 * @param config The repository configuration to save
 * @param global Whether to save to global directory
 */
export function saveRepository(
  config: GenericRepositoryConfig,
  global: boolean
): void {
  const dir = global ? getGlobalRepositoryDir() : getLocalRepositoryDir();
  ensureDir(dir);

  const filePath = join(dir, `${config.id}.yml`);
  const content = stringify(config, { indent: 2 });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Remove a repository configuration file.
 * @param id Repository ID to remove
 * @param global Whether to remove from global directory
 * @returns true if the file was removed, false if not found
 */
export function removeRepository(id: string, global: boolean): boolean {
  const dir = global ? getGlobalRepositoryDir() : getLocalRepositoryDir();
  const extensions = [".yml", ".yaml"];

  for (const ext of extensions) {
    const filePath = join(dir, `${id}${ext}`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
  }
  return false;
}

/**
 * Get all repository configurations.
 * @param global If true, only return global repositories
 * @returns Array of repository configurations
 */
export function getRepositories(global?: boolean): GenericRepositoryConfig[] {
  const configs: GenericRepositoryConfig[] = [];

  if (global === true || global === undefined) {
    const globalDir = getGlobalRepositoryDir();
    if (existsSync(globalDir)) {
      configs.push(...readRepositoriesFromDir(globalDir));
    }
  }

  if (global === false || global === undefined) {
    if (isProjectInitialized()) {
      const localDir = getLocalRepositoryDir();
      if (existsSync(localDir)) {
        configs.push(...readRepositoriesFromDir(localDir));
      }
    }
  }

  return configs;
}

/**
 * Check if a repository with the given ID exists.
 * @param id Repository ID
 * @param global Check in global directory only
 */
export function repositoryExists(id: string, global?: boolean): boolean {
  const repos = getRepositories(global);
  return repos.some((r) => r.id === id);
}

/**
 * Read GitHub repositories from github.yml file.
 */
function readGitHubRepos(dirPath: string): GitHubRepoEntry[] {
  const filePath = join(dirPath, "github.yml");
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const config = parse(content) as GitHubRepositoriesConfig;
    return config.repositories || [];
  } catch {
    return [];
  }
}

/**
 * Get GitHub repositories configuration.
 */
export function getGitHubRepos(global?: boolean): GitHubRepoEntry[] {
  const repos: GitHubRepoEntry[] = [];

  if (global === true || global === undefined) {
    const globalDir = getGlobalRepositoryDir();
    repos.push(...readGitHubRepos(globalDir));
  }

  if (global === false || global === undefined) {
    if (isProjectInitialized()) {
      const localDir = getLocalRepositoryDir();
      repos.push(...readGitHubRepos(localDir));
    }
  }

  return repos;
}

/**
 * Save GitHub repositories configuration.
 */
export function saveGitHubRepos(
  repos: GitHubRepoEntry[],
  global: boolean
): void {
  const dir = global ? getGlobalRepositoryDir() : getLocalRepositoryDir();
  ensureDir(dir);

  const filePath = join(dir, "github.yml");
  const config: GitHubRepositoriesConfig = { repositories: repos };
  const content = stringify(config, { indent: 2 });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Add a GitHub repository entry.
 */
export function addGitHubRepo(
  url: string,
  name: string,
  global: boolean
): void {
  const repos = getGitHubRepos(global);

  // Check if URL already exists
  if (repos.some((r) => r.url === url)) {
    throw new Error(`GitHub repository ${url} already exists`);
  }

  repos.push({ url, name });
  saveGitHubRepos(repos, global);
}

/**
 * Remove a GitHub repository entry by URL.
 */
export function removeGitHubRepo(url: string, global: boolean): boolean {
  const repos = getGitHubRepos(global);
  const filtered = repos.filter((r) => r.url !== url);

  if (filtered.length === repos.length) {
    return false; // Not found
  }

  saveGitHubRepos(filtered, global);
  return true;
}
