import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";
import { parseSource } from "../lib/source-resolver";

/**
 * Info command for displaying detailed plugin/mod information.
 */
export const infoCommand = define({
  name: "info",
  description: "Show detailed information about a plugin/mod",
  args: {
    target: {
      type: "positional",
      description: "Plugin/mod identifier (e.g., modrinth:viaversion)",
      required: true,
    },
  },
  run: async (ctx) => {
    const target =
      typeof ctx.values.target === "string" ? ctx.values.target : undefined;

    if (!target) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("Please specify a plugin/mod to get info for.")
      );
      console.log(pc.dim("Usage: sks info <source:id>"));
      console.log(pc.dim("Example: sks info modrinth:viaversion"));
      return;
    }

    // Load repositories
    loadRepositories();

    // Parse source specification
    const parsed = parseSource(target);

    const spinner = ora({
      text: `Fetching information...`,
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    try {
      // If source is specified, use that repository directly
      if (parsed.source && parsed.id) {
        const repoId = parsed.source === "spigot" ? "spiget" : parsed.source;
        const repo = repositoryManager.get(repoId);

        if (!repo) {
          spinner.fail(`Unknown source: ${parsed.source}`);
          return;
        }

        // For Spigot, if ID is not numeric, search first
        const parsedId = parsed.id;
        let resolvedId = parsedId;
        if (parsed.source === "spigot" && !/^\d+$/.test(parsedId)) {
          spinner.text = `Searching for "${parsedId}" on Spigot...`;
          const results = await repo.search(parsedId);
          const exactMatch = results.find(
            (r) => r.name.toLowerCase() === parsedId.toLowerCase()
          );
          if (exactMatch) {
            resolvedId = exactMatch.id;
          } else if (results.length > 0 && results[0]) {
            resolvedId = results[0].id;
          } else {
            spinner.fail(`No results found for "${parsedId}" on Spigot`);
            return;
          }
        }

        const resource = await repo.getResource(resolvedId);

        // Fetch actual latest version
        let latestVersion = "unknown";
        try {
          const versionInfo = await repo.getLatestVersion(resolvedId);
          latestVersion = versionInfo.version;
        } catch {
          // Ignore errors
        }

        spinner.stop();

        displayResourceInfo(resource, parsed.source, latestVersion);
        return;
      }

      // Search across all repositories
      const repos = repositoryManager.getAll();
      let found = false;

      for (const repo of repos) {
        try {
          const results = await repo.search(parsed.query || target);
          if (results.length > 0) {
            // Get detailed info for first exact match or first result
            const exactMatch = results.find(
              (r) => r.name.toLowerCase() === target.toLowerCase()
            );
            const match = exactMatch || results[0];
            if (match) {
              const resource = await repo.getResource(match.id);

              // Fetch actual latest version
              let latestVersion = "unknown";
              try {
                const versionInfo = await repo.getLatestVersion(match.id);
                latestVersion = versionInfo.version;
              } catch {
                // Ignore errors
              }

              spinner.stop();
              displayResourceInfo(resource, match.source, latestVersion);
              found = true;
              break;
            }
          }
        } catch {
          // Continue to next repository
        }
      }

      if (!found) {
        spinner.fail(`No plugin/mod found matching "${target}"`);
        console.log(
          pc.dim("Try specifying the source: sks info modrinth:viaversion")
        );
      }
    } catch (error) {
      spinner.fail(
        error instanceof Error ? error.message : "Failed to fetch information"
      );
    }
  },
});

/**
 * Display detailed resource information.
 */
function displayResourceInfo(
  resource: {
    name: string;
    id: string;
    description: string;
    author: string;
    version: string;
    downloads: number;
    url: string;
    testedVersions?: string[];
    external?: boolean;
    premium?: boolean;
  },
  source: string,
  latestVersion: string
): void {
  console.log("");
  console.log(pc.bold(pc.cyan("📦 " + resource.name)));
  console.log("");

  // Basic info
  console.log(pc.bold("Source:         ") + `${source}:${resource.id}`);
  console.log(pc.bold("Latest Version: ") + latestVersion);
  console.log(pc.bold("Author:         ") + resource.author);
  console.log(
    pc.bold("Downloads:      ") + formatDownloads(resource.downloads)
  );

  // Tested versions
  if (resource.testedVersions && resource.testedVersions.length > 0) {
    const versions = resource.testedVersions;
    if (versions.length === 1) {
      console.log(pc.bold("Supports:       ") + versions[0]);
    } else {
      const sorted = [...versions].sort((a, b) => {
        const aParts = a.split(".").map(Number);
        const bParts = b.split(".").map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
      console.log(
        pc.bold("Supports:       ") +
          `${sorted[0]} - ${sorted[sorted.length - 1]}`
      );
    }
  }

  // Flags
  if (resource.external) {
    console.log(
      pc.bold("External:    ") + pc.yellow("Yes (requires manual download)")
    );
  }
  if (resource.premium) {
    console.log(pc.bold("Premium:     ") + pc.yellow("Yes (paid resource)"));
  }

  // Description
  if (resource.description) {
    console.log("");
    console.log(pc.bold("Description:"));
    console.log(pc.dim("  " + resource.description));
  }

  // URL
  console.log("");
  console.log(pc.dim(resource.url));

  // Install hint
  console.log("");
  console.log(pc.dim(`To install: sks add ${source}:${resource.id}`));
}

/**
 * Format download count with K/M suffixes.
 */
function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + "M";
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + "K";
  }
  return count.toString();
}
