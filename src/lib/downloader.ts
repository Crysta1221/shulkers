import ky from "ky";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import pc from "picocolors";

/**
 * Download options.
 */
export interface DownloadOptions {
  /** Target directory */
  directory: string;
  /** File name (optional, derived from URL if not provided) */
  fileName?: string;
  /** Show progress (default: true) */
  showProgress?: boolean;
}

/**
 * Download result.
 */
export interface DownloadResult {
  /** Full path to the downloaded file */
  filePath: string;
  /** File size in bytes */
  size: number;
}

/**
 * Download a file from a URL.
 *
 * @param url Download URL
 * @param options Download options
 * @returns Download result
 */
export async function downloadFile(
  url: string,
  options: DownloadOptions
): Promise<DownloadResult> {
  const { directory, showProgress = true } = options;

  // Ensure directory exists
  await mkdir(directory, { recursive: true });

  // Determine file name
  let fileName = options.fileName;
  if (!fileName) {
    const urlPath = new URL(url).pathname;
    fileName = urlPath.split("/").pop() || "download";
  }

  const filePath = join(directory, fileName);

  if (showProgress) {
    console.log(pc.dim(`Downloading ${fileName}...`));
  }

  // Download with ky
  const response = await ky.get(url, {
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`
    );
  }

  const contentLength = response.headers.get("content-length");
  const _totalSize = contentLength ? Number.parseInt(contentLength, 10) : 0;
  void _totalSize; // May be used for future progress indication

  // Create write stream
  const fileStream = createWriteStream(filePath);
  const writable = Writable.toWeb(fileStream);

  // Track progress
  let downloadedSize = 0;

  const progressStream = new TransformStream({
    transform(chunk, controller) {
      downloadedSize += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  // Pipe response body through progress tracker to file
  await response.body.pipeThrough(progressStream).pipeTo(writable);

  return {
    filePath,
    size: downloadedSize,
  };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get the plugins/mods directory based on server type.
 *
 * @param serverType Server type from project.yml
 * @param projectRoot Project root directory
 * @returns Path to plugins or mods directory
 */
export function getPluginDirectory(
  serverType: string,
  projectRoot: string
): string {
  if (serverType === "mod") {
    return join(projectRoot, "mods");
  }
  return join(projectRoot, "plugins");
}
