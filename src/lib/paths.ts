import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Directory name for shulkers configuration */
const SHULKERS_DIR = ".shulkers";

/** Repository subdirectory name */
const REPOSITORY_DIR = "repository";

/** Project configuration filename */
export const PROJECT_FILE = "project.yml";

/**
 * Get the local .shulkers directory path (in current working directory).
 */
export function getLocalShulkersDir(): string {
  return join(process.cwd(), SHULKERS_DIR);
}

/**
 * Get the global .shulkers directory path (in user home directory).
 */
export function getGlobalShulkersDir(): string {
  return join(homedir(), SHULKERS_DIR);
}

/**
 * Get the local repository directory path.
 */
export function getLocalRepositoryDir(): string {
  return join(getLocalShulkersDir(), REPOSITORY_DIR);
}

/**
 * Get the global repository directory path.
 */
export function getGlobalRepositoryDir(): string {
  return join(getGlobalShulkersDir(), REPOSITORY_DIR);
}

/**
 * Get the project configuration file path.
 */
export function getProjectFilePath(): string {
  return join(getLocalShulkersDir(), PROJECT_FILE);
}

/**
 * Ensure a directory exists, creating it if necessary.
 * @param dirPath Path to the directory
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a shulkers project is initialized in the current directory.
 */
export function isProjectInitialized(): boolean {
  return existsSync(getProjectFilePath());
}
