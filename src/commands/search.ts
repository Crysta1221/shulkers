import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";
import { parseSource, formatSourceId } from "../lib/source-resolver";
import { renderTable, formatNumber } from "../lib/table-renderer";
import type { SearchResult } from "../lib/repositories/types";

/**
 * Search command for finding plugins/mods across repositories.
 */
export const searchCommand = define({
  name: "search",
  description: "Search for plugins/mods across repositories",
  args: {
    source: {
      type: "string",
      short: "s",
      description: "Filter by source (spigot, modrinth, github)",
    },
    type: {
      type: "string",
      short: "t",
      description: "Filter by type (mod, plugin)",
    },
    limit: {
      type: "number",
      short: "l",
      description: "Maximum number of results per source (default: 10)",
      default: 10,
    },
    query: {
      type: "positional",
      description: "Search query",
      required: true,
    },
  },
  run: async (ctx) => {
    const query =
      typeof ctx.values.query === "string" ? ctx.values.query : undefined;
    const sourceValue = ctx.values.source;
    const sourceFilter =
      typeof sourceValue === "string" ? sourceValue.toLowerCase() : undefined;
    const typeValue = ctx.values.type;
    const typeFilter =
      typeof typeValue === "string"
        ? (typeValue.toLowerCase() as "mod" | "plugin")
        : undefined;
    const limitValue = ctx.values.limit;
    const limit = typeof limitValue === "number" ? limitValue : 10;

    if (!query) {
      console.error(
        pc.red(pc.bold("Error:")) + " " + pc.red("Search query is required.")
      );
      console.log(pc.dim("Usage: sks search <query>"));
      return;
    }

    // Load repositories
    loadRepositories();

    // Parse source specification
    const parsed = parseSource(query);

    // If source:id format is used, use source as filter and id as query
    const effectiveSourceFilter = parsed.source
      ? parsed.source === "spigot"
        ? "spigot"
        : parsed.source
      : sourceFilter;
    const searchQuery =
      parsed.source && parsed.id ? parsed.id : parsed.query || query;

    const spinner = ora({
      text: `Searching for "${searchQuery}"...`,
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    // Collect results from all sources
    const allResults: (SearchResult & { sourceDisplay: string })[] = [];

    // Get repositories to search
    const repos = repositoryManager.getAll();

    for (const repo of repos) {
      // Skip if source filter is specified and doesn't match
      if (effectiveSourceFilter) {
        const repoSource = repo.id === "spiget" ? "spigot" : repo.id;
        if (
          repoSource !== effectiveSourceFilter &&
          repo.id !== effectiveSourceFilter
        ) {
          continue;
        }
      }

      // Skip Spiget for mod-only searches (SpigotMC only hosts plugins)
      if (typeFilter === "mod" && repo.id === "spiget") {
        continue;
      }

      try {
        const results = await repo.search(searchQuery);
        const limited = results.slice(0, limit);

        for (const result of limited) {
          // Filter by type if specified
          if (typeFilter && !result.types.includes(typeFilter)) {
            continue;
          }

          allResults.push({
            ...result,
            sourceDisplay: result.source,
          });
        }
      } catch (error) {
        spinner.warn(
          `Failed to search ${repo.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        spinner.start(`Searching for "${searchQuery}"...`);
      }
    }

    if (allResults.length === 0) {
      spinner.fail("No results found.");
      console.log(
        pc.dim(
          "Try a different search query or check your internet connection."
        )
      );
      return;
    }

    spinner.succeed(`Found ${allResults.length} results.`);
    console.log("");

    // Render results table
    renderTable(
      [
        {
          header: "Name",
          key: "name",
          width: 25,
          headerColor: "green",
          grow: true,
        },
        {
          header: "ID",
          key: "fullId",
          width: 25,
          headerColor: "cyan",
          grow: true,
        },
        { header: "Type", key: "typeDisplay", width: 8, headerColor: "yellow" },
        {
          header: "Downloads",
          key: "downloads",
          width: 12,
          align: "right",
          headerColor: "magenta",
        },
        {
          header: "Source",
          key: "sourceDisplay",
          width: 10,
          headerColor: "blue",
        },
      ],
      allResults.map((r) => {
        // Format types: show both if project supports both
        const typeLabels = r.types.map((t) =>
          t === "mod" ? pc.cyan("mod") : pc.green("plugin")
        );
        const typeDisplay = typeLabels.join(", ");

        return {
          name: r.name,
          fullId: formatSourceId(
            r.source as "spigot" | "modrinth" | "github",
            r.id
          ),
          typeDisplay,
          downloads: formatNumber(r.downloads),
          sourceDisplay: r.sourceDisplay,
        };
      })
    );

    console.log("");
    console.log(pc.dim("To install: sks install <source:id>"));
  },
});
