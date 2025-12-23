import ky from "ky";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getGlobalShulkersDir } from "./paths";
import pkg from "../../package.json";

/** GitHub release response type */
interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

/** GitHub asset type */
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** Update check result */
export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  assets: GitHubAsset[];
}

/** Cache data structure */
interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
  releaseUrl: string;
  assets: GitHubAsset[];
}

const REPO = "Crysta1221/shulkers";
const CACHE_FILE = "update-cache.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get current CLI version from package.json.
 */
export function getCurrentVersion(): string {
  return pkg.version;
}

/**
 * Parse semver version string to components.
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
  const clean = version.replace(/^v/, "");
  const parts = clean.split(".");
  return {
    major: Number.parseInt(parts[0] ?? "0", 10),
    minor: Number.parseInt(parts[1] ?? "0", 10),
    patch: Number.parseInt(parts[2] ?? "0", 10),
  };
}

/**
 * Compare two versions. Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) return vA.major < vB.major ? -1 : 1;
  if (vA.minor !== vB.minor) return vA.minor < vB.minor ? -1 : 1;
  if (vA.patch !== vB.patch) return vA.patch < vB.patch ? -1 : 1;
  return 0;
}

/**
 * Get the cache file path.
 */
function getCacheFilePath(): string {
  return join(getGlobalShulkersDir(), CACHE_FILE);
}

/**
 * Read update cache from disk.
 */
function readCache(): UpdateCache | null {
  const cachePath = getCacheFilePath();
  if (!existsSync(cachePath)) return null;

  try {
    const content = readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as UpdateCache;
  } catch {
    return null;
  }
}

/**
 * Write update cache to disk.
 */
function writeCache(cache: UpdateCache): void {
  const globalDir = getGlobalShulkersDir();
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  const cachePath = getCacheFilePath();
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Fetch latest release from GitHub API.
 */
export async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await ky
    .get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "shulkers-cli/1.0.0",
      },
      timeout: 10000,
    })
    .json<GitHubRelease>();

  return response;
}

/**
 * Check for updates with caching.
 * Returns null if check fails (silently).
 */
export async function checkForUpdates(
  forceRefresh = false
): Promise<UpdateCheckResult | null> {
  const currentVersion = getCurrentVersion();

  // Check cache first
  if (!forceRefresh) {
    const cache = readCache();
    if (cache && Date.now() - cache.lastCheck < CACHE_TTL_MS) {
      return {
        currentVersion,
        latestVersion: cache.latestVersion,
        hasUpdate: compareVersions(currentVersion, cache.latestVersion) < 0,
        releaseUrl: cache.releaseUrl,
        assets: cache.assets,
      };
    }
  }

  // Fetch from GitHub
  try {
    const release = await fetchLatestRelease();
    const latestVersion = release.tag_name.replace(/^v/, "");

    // Update cache
    const cache: UpdateCache = {
      lastCheck: Date.now(),
      latestVersion,
      releaseUrl: release.html_url,
      assets: release.assets,
    };
    writeCache(cache);

    return {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(currentVersion, latestVersion) < 0,
      releaseUrl: release.html_url,
      assets: release.assets,
    };
  } catch {
    // Silently fail - don't block CLI usage
    return null;
  }
}

/**
 * Check for updates without blocking (async, fire-and-forget style).
 * Returns cached result immediately if available and valid.
 */
export function checkForUpdatesSync(): UpdateCheckResult | null {
  const currentVersion = getCurrentVersion();
  const cache = readCache();

  if (cache && Date.now() - cache.lastCheck < CACHE_TTL_MS) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      hasUpdate: compareVersions(currentVersion, cache.latestVersion) < 0,
      releaseUrl: cache.releaseUrl,
      assets: cache.assets,
    };
  }

  return null;
}
