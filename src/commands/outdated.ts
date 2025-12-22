import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { readProject, getDependencies } from "../lib/project";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";

/**
 * Parse semver version string to components.
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} {
  // Remove common prefixes and suffixes
  const cleaned = version.replace(/^v/i, "");
  // Match semver pattern
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

  // For prerelease, empty string (stable) > any prerelease
  if (vA.prerelease === "" && vB.prerelease !== "") return 1;
  if (vA.prerelease !== "" && vB.prerelease === "") return -1;

  return 0;
}

/**
 * Find the latest minor update version (same major version).
 */
function findMinorUpdate(
  currentVersion: string,
  versions: { name: string }[]
): string | null {
  const current = parseVersion(currentVersion);
  let bestUpdate: string | null = null;

  for (const v of versions) {
    const parsed = parseVersion(v.name);
    // Same major version only
    if (parsed.major !== current.major) continue;
    // Must be newer
    if (compareVersions(v.name, currentVersion) <= 0) continue;
    // Better than current best?
    if (!bestUpdate || compareVersions(v.name, bestUpdate) > 0) {
      bestUpdate = v.name;
    }
  }

  return bestUpdate;
}

interface OutdatedInfo {
  name: string;
  source: string;
  id: string;
  current: string;
  update: string | null;
  latest: string;
}

/**
 * Outdated command for checking plugin updates.
 */
export const outdatedCommand = define({
  name: "outdated",
  description: "Check for outdated plugins/mods",
  args: {},
  run: async (_ctx) => {
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

    const spinner = ora({
      text: "Checking for updates...",
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    const outdated: OutdatedInfo[] = [];
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

        // Get latest version
        const latestVersion = versions[0]?.name ?? dep.version;

        // Find minor update
        const minorUpdate = findMinorUpdate(dep.version, versions);

        // Check if outdated
        if (compareVersions(dep.version, latestVersion) < 0) {
          outdated.push({
            name,
            source: dep.source,
            id: dep.id,
            current: dep.version,
            update: minorUpdate,
            latest: latestVersion,
          });
        }
      } catch {
        // Skip plugins that fail version check
      }

      checked++;
    }

    spinner.stop();

    if (outdated.length === 0) {
      ora().succeed("All plugins are up to date!");
      return;
    }

    // Display table header
    console.log("");
    const colPlugin = 30;
    const colVersion = 20;

    console.log(
      pc.cyan(pc.bold("Plugin".padEnd(colPlugin))) +
        pc.dim("Current".padEnd(colVersion)) +
        pc.yellow("Update".padEnd(colVersion)) +
        pc.green("Latest")
    );
    console.log(pc.dim("─".repeat(colPlugin + colVersion * 2 + 15)));

    // Display each outdated plugin
    for (const info of outdated) {
      const updateDisplay = info.update
        ? pc.yellow(info.update.padEnd(colVersion))
        : pc.dim("-".padEnd(colVersion));

      console.log(
        pc.bold(info.name.padEnd(colPlugin)) +
          pc.dim(info.current.padEnd(colVersion)) +
          updateDisplay +
          pc.green(info.latest)
      );
    }

    console.log("");
    console.log(pc.dim(`${outdated.length} plugin(s) can be updated.`));
    console.log(pc.dim("Run 'sks update' to update to minor versions."));
    console.log(
      pc.dim("Run 'sks update --latest' to update to latest versions.")
    );
  },
});
