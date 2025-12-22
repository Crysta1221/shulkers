import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { select, confirm } from "@inquirer/prompts";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";
import { parseSource, formatSourceId } from "../lib/source-resolver";
import { renderTable, formatNumber } from "../lib/table-renderer";
import {
  downloadFile,
  getPluginDirectory,
  formatBytes,
} from "../lib/downloader";
import { readProject, addDependency } from "../lib/project";
import { isUserCancelError } from "../lib/prompts";
import type { SearchResult, Repository } from "../lib/repositories/types";
import { getCompatibleLoaders } from "../lib/server-utils";

/**
 * Core plugin installation logic.
 */
export async function installPlugin(ctx: {
  positionals?: string[];
}): Promise<void> {
  try {
    // Known command aliases to filter out from positionals
    const commandAliases = new Set(["install", "add", "i"]);

    // Get all positional args as targets, filtering out command names
    const targets =
      ctx.positionals?.filter(
        (t) => typeof t === "string" && !commandAliases.has(t)
      ) || [];

    if (targets.length === 0) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("Please specify what to install.")
      );
      console.log(pc.dim("Usage: sks install <plugin1> [plugin2] ..."));
      console.log(pc.dim("Example: sks install viaversion geyser"));
      return;
    }

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

    // Process each target
    for (const target of targets) {
      // Parse source specification
      const parsed = parseSource(target);

      if (parsed.source && parsed.id) {
        // Direct source:id format
        await installFromSource(
          parsed.source,
          parsed.id,
          parsed.version,
          project
        );
      } else {
        // Search for the target and let user select
        await searchAndInstall(parsed.query || target, parsed.version, project);
      }
    }
  } catch (error) {
    if (isUserCancelError(error)) {
      console.log("");
      console.log(pc.red("❌ Operation canceled"));
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Install command - installs plugins from project.yml.
 */
export const installCommand = define({
  name: "install",
  description: "Install plugin(s) from project.yml",
  args: {
    target: {
      type: "positional",
      description: "Plugin(s) to install (name or source:id[@version])",
      required: true,
    },
  },
  run: async (ctx) => {
    await installPlugin(ctx);
  },
});

/**
 * Install from a specific source and ID.
 */
async function installFromSource(
  source: string,
  id: string,
  version: string | null,
  project: ReturnType<typeof readProject>
): Promise<void> {
  if (!project) return;

  // Map source to repository ID
  const repoId = source === "spigot" ? "spiget" : source;
  const repo = repositoryManager.get(repoId);

  if (!repo) {
    console.error(
      pc.red(pc.bold("Error:")) + " " + pc.red(`Unknown source: ${source}`)
    );
    return;
  }

  // For Spigot, if ID is not numeric, search for the resource first
  let resolvedId = id;
  if (source === "spigot" && !/^\d+$/.test(id)) {
    const searchSpinner = ora({
      text: `Searching for "${id}" on Spigot...`,
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    try {
      const results = await repo.search(id);
      // Find exact match by name
      const exactMatch = results.find(
        (r) => r.name.toLowerCase() === id.toLowerCase()
      );

      if (exactMatch) {
        resolvedId = exactMatch.id;
        searchSpinner.succeed(`Found ${exactMatch.name} (ID: ${resolvedId})`);
      } else if (results.length > 0 && results[0]) {
        // Use first result if no exact match
        resolvedId = results[0].id;
        searchSpinner.succeed(`Found ${results[0].name} (ID: ${resolvedId})`);
      } else {
        searchSpinner.fail(`No results found for "${id}" on Spigot`);
        return;
      }
    } catch (error) {
      searchSpinner.fail(`Failed to search for "${id}" on Spigot`);
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red(error instanceof Error ? error.message : String(error))
      );
      return;
    }
  }

  const spinner = ora({
    text: "Fetching resource information...",
    spinner: cliSpinners.dots,
    color: "cyan",
  }).start();

  try {
    // Get resource details
    const resource = await repo.getResource(resolvedId);
    spinner.succeed(`Found ${resource.name}`);

    // Check for external/premium
    if (resource.external) {
      console.log(
        pc.yellow(pc.bold("Warning:")) +
          " " +
          pc.yellow("This resource is hosted externally.")
      );
      console.log(
        pc.dim("External resources cannot be downloaded automatically.")
      );
      console.log(pc.dim(`Please visit: ${resource.url}`));
      return;
    }

    if (resource.premium) {
      console.log(
        pc.yellow(pc.bold("Warning:")) +
          " " +
          pc.yellow("This is a premium (paid) resource.")
      );
      console.log(
        pc.dim("Premium resources cannot be downloaded automatically.")
      );
      console.log(pc.dim(`Please purchase and download from: ${resource.url}`));
      return;
    }

    // Get compatible loaders for filtering (specifically for Modrinth)
    // Use server.type (e.g. "paper", "fabric") not serverType (which is "plugin", "mod", "proxy")
    const loaders = getCompatibleLoaders(project.server.type);

    // Get version info
    let versionInfo;
    if (version) {
      console.log(pc.dim(`Looking for version ${version}...`));
      try {
        versionInfo = await repo.getVersionDownload(
          resolvedId,
          version,
          loaders
        );
      } catch {
        // Version not found - show available versions that match
        console.error(
          pc.red(pc.bold("Error:")) +
            " " +
            pc.red(`Version ${version} not found for ${resource.name}`)
        );

        // Get available versions and filter by prefix
        try {
          const allVersions = await repo.getVersions(resolvedId);

          // Filter by version prefix and deduplicate by base version (x.x.x part)
          const matchingVersions = allVersions.filter((v) =>
            v.name.startsWith(version)
          );

          // Deduplicate: group by base version (before SNAPSHOT/+/- suffix) and keep first (latest)
          const deduped = new Map<string, (typeof matchingVersions)[0]>();
          for (const v of matchingVersions) {
            // Extract base version (e.g., "5.6.1" from "5.6.1-SNAPSHOT+877")
            const baseVersion = v.name.split(/[-+]/)[0] ?? v.name;
            if (!deduped.has(baseVersion)) {
              deduped.set(baseVersion, v);
            }
          }
          const uniqueVersions = Array.from(deduped.values()).slice(0, 10);

          if (uniqueVersions.length > 0) {
            console.log("");
            console.log(
              pc.yellow("Available versions matching " + pc.bold(version) + ":")
            );
            for (const v of uniqueVersions) {
              console.log(pc.dim("  - " + v.name));
            }
          } else {
            // Show latest versions instead (also deduplicated)
            const latestDeduped = new Map<string, (typeof allVersions)[0]>();
            for (const v of allVersions) {
              const baseVersion = v.name.split(/[-+]/)[0] ?? v.name;
              if (!latestDeduped.has(baseVersion)) {
                latestDeduped.set(baseVersion, v);
              }
            }
            const latestVersions = Array.from(latestDeduped.values()).slice(
              0,
              5
            );
            if (latestVersions.length > 0) {
              console.log("");
              console.log(pc.yellow("Latest available versions:"));
              for (const v of latestVersions) {
                console.log(pc.dim("  - " + v.name));
              }
            }
          }
        } catch {
          // Ignore version listing errors
        }
        return;
      }
    } else {
      versionInfo = await repo.getLatestVersion(resolvedId, loaders);
    }

    // Format Supports as "min - max" range
    let supportsDisplay = "";
    if (resource.testedVersions.length > 0) {
      const versions = resource.testedVersions;
      if (versions.length === 1) {
        supportsDisplay = versions[0] ?? "";
      } else {
        // Sort versions and get min/max
        const sorted = [...versions].sort((a, b) => {
          const aParts = a.split(".").map(Number);
          const bParts = b.split(".").map(Number);
          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
            if (diff !== 0) return diff;
          }
          return 0;
        });
        supportsDisplay = `${sorted[0]} - ${sorted[sorted.length - 1]}`;
      }
    }

    // Display info
    console.log("");
    console.log(pc.bold("Resource:") + " " + resource.name);
    console.log(
      pc.bold("Source:") +
        " " +
        formatSourceId(source as "spigot" | "modrinth" | "github", id)
    );
    console.log(pc.bold("Version:") + " " + versionInfo.version);
    console.log(pc.bold("Author:") + " " + resource.author);
    if (supportsDisplay) {
      console.log(pc.bold("Supports:") + " " + supportsDisplay);
    }

    // Compatibility check
    const serverVersion = project.server.version;
    if (resource.testedVersions.length > 0) {
      const isCompatible = resource.testedVersions.some((v) =>
        serverVersion.startsWith(v.split(".").slice(0, 2).join("."))
      );

      if (!isCompatible) {
        console.log("");
        console.log(
          pc.yellow(pc.bold("Warning:")) +
            " " +
            pc.yellow(
              `This resource may not be compatible with your server version (${serverVersion}).`
            )
        );
        const proceed = await confirm({
          message: "Continue installation anyway?",
          default: false,
        });
        if (!proceed) {
          console.log(pc.dim("Installation cancelled."));
          return;
        }
      }
    }

    // Determine target directory
    const pluginDir = getPluginDirectory(project.serverType, process.cwd());

    // Download (silent)
    const result = await downloadFile(versionInfo.downloadUrl, {
      directory: pluginDir,
      fileName: versionInfo.fileName,
    });

    // Save to project.yml
    addDependency(resource.name, {
      source: source as "spigot" | "modrinth" | "github",
      id: id,
      version: versionInfo.version,
      fileName: versionInfo.fileName,
    });

    // Output in "+ name (version)" format
    console.log("");
    console.log(
      pc.green("+") +
        " " +
        pc.bold(resource.name) +
        " " +
        pc.dim(`(v${versionInfo.version}, ${formatBytes(result.size)})`)
    );
  } catch (error) {
    console.error(
      pc.red(pc.bold("Error:")) +
        " " +
        pc.red(error instanceof Error ? error.message : String(error))
    );
  }
}

/**
 * Search for a plugin and let user select from results.
 */
async function searchAndInstall(
  query: string,
  version: string | null,
  project: ReturnType<typeof readProject>
): Promise<void> {
  if (!project) return;

  const spinner = ora({
    text: `Searching for "${query}"...`,
    spinner: cliSpinners.dots,
    color: "cyan",
  }).start();

  // Determine expected type based on server category
  const serverCategory = project.serverType; // "plugin", "mod", or "proxy"
  const expectedType = serverCategory === "mod" ? "mod" : "plugin";

  // Search all repositories
  const allResults: (SearchResult & { repo: Repository })[] = [];
  const repos = repositoryManager.getAll();

  for (const repo of repos) {
    // Skip repositories that don't support the expected asset type
    if (!repo.assetTypes.includes(expectedType)) {
      continue;
    }

    try {
      const results = await repo.search(query);
      for (const result of results.slice(0, 5)) {
        // Filter by expected type
        if (!result.types.includes(expectedType)) {
          continue;
        }
        allResults.push({ ...result, repo });
      }
    } catch {
      // Ignore search errors
    }
  }

  if (allResults.length === 0) {
    spinner.fail("No results found.");
    return;
  }

  // Find all exact matches (case-insensitive)
  const exactMatches = allResults.filter(
    (r) => r.name.toLowerCase() === query.toLowerCase()
  );

  // Single exact match - proceed directly
  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    if (match) {
      spinner.succeed(`Found exact match: ${match.name}`);
      await installFromSource(match.source, match.id, version, project);
      return;
    }
  }

  // Multiple exact matches from different sources - show selection
  if (exactMatches.length > 1) {
    spinner.succeed(`Found ${exactMatches.length} sources for "${query}"`);
    console.log("");

    // Show table
    renderTable(
      [
        { header: "Name", key: "name", width: 25 },
        { header: "ID", key: "fullId", width: 25 },
        { header: "Downloads", key: "downloads", width: 12, align: "right" },
        { header: "Source", key: "source", width: 10 },
      ],
      exactMatches.map((r) => ({
        name: r.name,
        fullId: formatSourceId(
          r.source as "spigot" | "modrinth" | "github",
          r.id
        ),
        downloads: formatNumber(r.downloads),
        source: r.source,
      }))
    );

    console.log("");

    // Let user select
    const selected = await select({
      message: "Select source to install from:",
      choices: [
        ...exactMatches.map((r) => ({
          name: `${r.source}: ${r.name} (${formatNumber(
            r.downloads
          )} downloads)`,
          value: r,
        })),
        { name: "❌ Cancel", value: null },
      ],
    });

    if (!selected) {
      console.log(pc.dim("Installation cancelled."));
      return;
    }

    await installFromSource(selected.source, selected.id, version, project);
    return;
  }

  // No exact match - show all results
  spinner.succeed(`Found ${allResults.length} result(s)`);
  console.log("");

  // Show search results and prompt for ID
  renderTable(
    [
      { header: "Name", key: "name", width: 25 },
      { header: "ID", key: "fullId", width: 25 },
      { header: "Version", key: "version", width: 12 },
      { header: "Downloads", key: "downloads", width: 12, align: "right" },
      { header: "Source", key: "source", width: 10 },
    ],
    allResults.map((r) => ({
      name: r.name,
      fullId: formatSourceId(
        r.source as "spigot" | "modrinth" | "github",
        r.id
      ),
      version: r.version,
      downloads: formatNumber(r.downloads),
      source: r.source,
    }))
  );

  console.log("");
  console.log(
    pc.dim("Multiple results found. Please specify with source:id format:")
  );
  console.log(pc.dim("Example: sks install spigot:19254"));
}
