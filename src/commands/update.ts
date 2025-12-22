import { define } from "gunshi";
import { unlink, stat, chown } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import {
  readProject,
  getDependencies,
  updateDependencyVersion,
} from "../lib/project";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";
import {
  downloadFile,
  getPluginDirectory,
  formatBytes,
} from "../lib/downloader";

/**
 * Parse semver version string to components.
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} {
  const cleaned = version.replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0, prerelease: version };
  }
  return {
    major: parseInt(match[1] ?? "0", 10),
    minor: parseInt(match[2] ?? "0", 10),
    patch: parseInt(match[3] ?? "0", 10),
    prerelease: match[4] ?? "",
  };
}

/**
 * Compare two versions. Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) return vA.major < vB.major ? -1 : 1;
  if (vA.minor !== vB.minor) return vA.minor < vB.minor ? -1 : 1;
  if (vA.patch !== vB.patch) return vA.patch < vB.patch ? -1 : 1;

  if (vA.prerelease === "" && vB.prerelease !== "") return 1;
  if (vA.prerelease !== "" && vB.prerelease === "") return -1;

  return 0;
}

/**
 * Find the best minor update (same major version).
 */
function findMinorUpdate(
  currentVersion: string,
  versions: { name: string; gameVersions?: string[] }[]
): { name: string; gameVersions?: string[] } | null {
  const current = parseVersion(currentVersion);
  let best: { name: string; gameVersions?: string[] } | null = null;

  for (const v of versions) {
    const parsed = parseVersion(v.name);
    if (parsed.major !== current.major) continue;
    if (compareVersions(v.name, currentVersion) <= 0) continue;
    if (!best || compareVersions(v.name, best.name) > 0) {
      best = v;
    }
  }

  return best;
}

/**
 * Check if version supports server version.
 */
function supportsServerVersion(
  gameVersions: string[] | undefined,
  serverVersion: string
): boolean {
  if (!gameVersions || gameVersions.length === 0) return true;
  const serverParts = serverVersion.split(".").slice(0, 2).join(".");
  return gameVersions.some(
    (v) =>
      v.startsWith(serverParts) ||
      serverVersion.startsWith(v.split(".").slice(0, 2).join("."))
  );
}

/**
 * Copy file ownership from source to target (Linux only).
 */
async function copyFileOwnership(
  sourcePath: string,
  targetPath: string
): Promise<void> {
  try {
    if (process.platform !== "linux" && process.platform !== "darwin") return;

    const sourceStats = await stat(sourcePath);
    await chown(targetPath, sourceStats.uid, sourceStats.gid);
  } catch {
    // Ignore ownership errors (may not have permissions)
  }
}

/**
 * Update command for updating plugins/mods.
 */
export const updateCommand = define({
  name: "update",
  description: "Update plugins/mods to newer versions",
  args: {
    latest: {
      type: "boolean",
      description: "Update to latest version (not just minor)",
    },
    safe: {
      type: "boolean",
      description: "Only update if target version supports server version",
    },
  },
  run: async (ctx) => {
    const useLatest = ctx.values.latest === true;
    const useSafe = ctx.values.safe === true;

    // Check for project.yml
    const project = readProject();
    if (!project) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("No project.yml found. Run 'sks init' first.")
      );
      return;
    }

    // Load repositories
    loadRepositories();

    // Get dependencies
    const dependencies = getDependencies();
    const dependencyNames = Object.keys(dependencies);

    if (dependencyNames.length === 0) {
      console.log(pc.dim("No dependencies installed."));
      return;
    }

    const serverVersion = project.server.version;
    const pluginDir = getPluginDirectory(project.serverType, process.cwd());

    const spinner = ora({
      text: "Checking for updates...",
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    interface UpdateInfo {
      name: string;
      source: string;
      id: string;
      current: string;
      target: { name: string; gameVersions?: string[] };
      targetVersionInfo: {
        version: string;
        downloadUrl: string;
        fileName: string;
      };
      oldFileName?: string;
    }

    const updates: UpdateInfo[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let checked = 0;

    for (const name of dependencyNames) {
      const dep = dependencies[name];
      if (!dep) continue;

      spinner.text = `Checking ${name}... (${checked + 1}/${
        dependencyNames.length
      })`;

      try {
        const repoId = dep.source === "spigot" ? "spiget" : dep.source;
        const repo = repositoryManager.get(repoId);
        if (!repo) continue;

        // Get versions
        const versions = await repo.getVersions(dep.id);
        if (versions.length === 0) continue;

        // Determine target version
        let targetVersion: { name: string; gameVersions?: string[] } | null =
          null;

        if (useLatest) {
          // Use latest version
          const latest = versions[0];
          if (latest && compareVersions(dep.version, latest.name) < 0) {
            targetVersion = latest;
          }
        } else {
          // Minor update only
          targetVersion = findMinorUpdate(dep.version, versions);
        }

        if (!targetVersion) {
          checked++;
          continue;
        }

        // Safe mode check
        if (
          useSafe &&
          !supportsServerVersion(targetVersion.gameVersions, serverVersion)
        ) {
          skipped.push({
            name,
            reason: `v${targetVersion.name} does not support server ${serverVersion}`,
          });
          checked++;
          continue;
        }

        // Get download info for target version
        const versionInfo = await repo.getVersionDownload(
          dep.id,
          targetVersion.name
        );

        updates.push({
          name,
          source: dep.source,
          id: dep.id,
          current: dep.version,
          target: targetVersion,
          targetVersionInfo: versionInfo,
          oldFileName: dep.fileName,
        });
      } catch {
        // Skip plugins that fail
      }

      checked++;
    }

    spinner.stop();

    if (updates.length === 0 && skipped.length === 0) {
      ora().succeed("All plugins are up to date!");
      return;
    }

    // Show skipped plugins
    if (skipped.length > 0) {
      console.log(pc.yellow("Skipped (incompatible):"));
      for (const s of skipped) {
        console.log(pc.dim(`  ○ ${s.name}: ${s.reason}`));
      }
      console.log("");
    }

    if (updates.length === 0) {
      console.log(pc.dim("No updates to apply."));
      return;
    }

    // Apply updates
    let updatedCount = 0;
    let failedCount = 0;

    for (const update of updates) {
      const updateSpinner = ora({
        text: `${update.name}...`,
        spinner: cliSpinners.dots,
        color: "cyan",
      }).start();

      try {
        // Get old file path for ownership copy
        const oldFilePath = update.oldFileName
          ? join(pluginDir, update.oldFileName)
          : null;
        const oldFileExists = oldFilePath && existsSync(oldFilePath);

        // Delete old file if exists
        if (oldFileExists && oldFilePath) {
          try {
            await unlink(oldFilePath);
          } catch {
            // Ignore deletion errors
          }
        }

        // Download new version
        const result = await downloadFile(
          update.targetVersionInfo.downloadUrl,
          {
            directory: pluginDir,
            fileName: update.targetVersionInfo.fileName,
            showProgress: false,
          }
        );

        // Copy ownership from old file or existing jar
        if (oldFileExists && oldFilePath) {
          // Try to copy from a sibling jar file
          const { readdirSync } = await import("node:fs");
          const jarFiles = readdirSync(pluginDir).filter(
            (f) => f.endsWith(".jar") && join(pluginDir, f) !== result.filePath
          );
          if (jarFiles.length > 0 && jarFiles[0]) {
            await copyFileOwnership(
              join(pluginDir, jarFiles[0]),
              result.filePath
            );
          }
        }

        // Update project.yml
        updateDependencyVersion(
          update.name,
          update.targetVersionInfo.version,
          update.targetVersionInfo.fileName
        );

        updateSpinner.succeed(
          `${update.name}: ${pc.dim(update.current)} → ${pc.green(
            update.targetVersionInfo.version
          )} ` + pc.dim(`(${formatBytes(result.size)})`)
        );
        updatedCount++;
      } catch (error) {
        // Parse HTTP error message to extract only status code
        let errorMsg = "Unknown error";
        if (error instanceof Error) {
          // Extract status code from messages like "Request failed with status code 403 Forbidden: GET https://..."
          const statusMatch = error.message.match(/(\d{3}\s+\w+)/);
          if (statusMatch) {
            errorMsg = statusMatch[1] ?? "Unknown error";
          } else {
            // Fallback: truncate long error messages and remove URLs
            errorMsg = error.message
              .replace(/https?:\/\/[^\s]+/g, "")
              .trim()
              .slice(0, 50);
          }
        }
        updateSpinner.fail(`${update.name}: ${errorMsg}`);
        failedCount++;
      }
    }

    // Summary
    console.log("");
    const warnCount = skipped.length;
    const summaryParts: string[] = [];
    if (updatedCount > 0) {
      summaryParts.push(pc.green(`Updated: ${updatedCount}`));
    }
    if (warnCount > 0) {
      summaryParts.push(pc.yellow(`Warn: ${warnCount}`));
    }
    if (failedCount > 0) {
      summaryParts.push(pc.red(`Failed: ${failedCount}`));
    }
    if (summaryParts.length > 0) {
      console.log(summaryParts.join("  "));
    }
  },
});
