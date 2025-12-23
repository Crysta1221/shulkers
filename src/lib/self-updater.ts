import { existsSync, unlinkSync, renameSync, chmodSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ky from "ky";
import type { UpdateCheckResult } from "./version-checker";

/** Supported platforms for binary downloads */
type Platform = "windows-x64" | "linux-x64" | "linux-arm64";

/**
 * Detect the current platform.
 */
export function detectPlatform(): Platform {
  const os = process.platform;
  const arch = process.arch;

  if (os === "win32") {
    return "windows-x64";
  }

  if (os === "linux") {
    if (arch === "arm64") {
      return "linux-arm64";
    }
    return "linux-x64";
  }

  // Default to linux-x64 for unsupported platforms
  return "linux-x64";
}

/**
 * Get the binary file name for the platform.
 */
export function getBinaryName(platform: Platform): string {
  switch (platform) {
    case "windows-x64":
      return "shulkers-windows-x64.exe";
    case "linux-arm64":
      return "shulkers-linux-arm64";
    case "linux-x64":
    default:
      return "shulkers-linux-x64";
  }
}

/**
 * Get the current executable path.
 */
export function getCurrentExecutablePath(): string {
  return process.execPath;
}

/**
 * Find the download asset for the current platform.
 */
export function findPlatformAsset(
  updateInfo: UpdateCheckResult
): { url: string; fileName: string } | null {
  const platform = detectPlatform();
  const binaryName = getBinaryName(platform);

  const asset = updateInfo.assets.find((a) => a.name === binaryName);
  if (!asset) {
    return null;
  }

  return {
    url: asset.browser_download_url,
    fileName: asset.name,
  };
}

/**
 * Download the new binary to a temporary location.
 */
export async function downloadUpdate(
  url: string,
  targetPath: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const targetDir = dirname(targetPath);
  await mkdir(targetDir, { recursive: true });

  const response = await ky.get(url, {
    timeout: 300000, // 5 minutes
    onDownloadProgress: (progress) => {
      if (onProgress && progress.totalBytes) {
        onProgress(progress.transferredBytes, progress.totalBytes);
      }
    },
  });

  const buffer = await response.arrayBuffer();
  await writeFile(targetPath, Buffer.from(buffer));
}

/**
 * Replace the current executable with the new one.
 */
export function replaceExecutable(currentPath: string, newPath: string): void {
  const backupPath = `${currentPath}.backup`;

  // Remove old backup if exists
  if (existsSync(backupPath)) {
    unlinkSync(backupPath);
  }

  // Backup current executable
  if (existsSync(currentPath)) {
    renameSync(currentPath, backupPath);
  }

  // Move new executable to current location
  renameSync(newPath, currentPath);

  // Make executable on Unix
  if (process.platform !== "win32") {
    chmodSync(currentPath, 0o755);
  }
}

/**
 * Get the temporary download path for updates.
 */
export function getTempDownloadPath(): string {
  const platform = detectPlatform();
  const binaryName = getBinaryName(platform);

  if (process.platform === "win32") {
    const tempDir = process.env.TEMP || process.env.TMP || "C:\\Temp";
    return join(tempDir, `shulkers-update-${binaryName}`);
  }

  return `/tmp/shulkers-update-${binaryName}`;
}

/**
 * Check if we can write to the current executable location.
 */
export function canSelfUpdate(): boolean {
  const execPath = getCurrentExecutablePath();

  // If running via bun/node directly, cannot self-update
  if (execPath.includes("bun") || execPath.includes("node")) {
    return false;
  }

  // Check if executable exists and is writable
  if (!existsSync(execPath)) {
    return false;
  }

  return true;
}
