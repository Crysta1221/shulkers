import { define } from "gunshi";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { select, confirm, input } from "@inquirer/prompts";
import {
  readProject,
  addDependency,
  getDependencies,
  type DependencyEntry,
} from "../lib/project";
import { getPluginDirectory } from "../lib/downloader";
import { analyzeJar, parseJarFileName } from "../lib/jar-analyzer";
import { isProjectInitialized } from "../lib/paths";
import { repositoryManager } from "../lib/repositories/manager";
import { loadRepositories } from "../lib/config";
import { isUserCancelError } from "../lib/prompts";
import type {
  SearchOptions,
  SearchResult,
  VersionEntry,
} from "../lib/repositories/types";
import { getCompatibleLoaders } from "../lib/server-utils";

/** Analyzed plugin info */
export interface PluginInfo {
  fileName: string;
  name: string;
  version: string;
  type: string;
  isNew: boolean;
}

/** Source option for linking */
export type SourceType =
  | "spigot"
  | "modrinth"
  | "github"
  | "private"
  | "skip"
  | "custom";

type SearchableSource = Exclude<SourceType, "private" | "skip" | "custom">;
type AutomaticSource = Extract<SearchableSource, "modrinth" | "spigot">;

const AUTO_LINK_SOURCE_PRIORITY = [
  "modrinth",
  "spigot",
] as const satisfies readonly AutomaticSource[];

const SPIGOT_COMPATIBLE_LOADERS = new Set([
  "bukkit",
  "spigot",
  "paper",
  "purpur",
  "folia",
  "bungeecord",
  "waterfall",
  "velocity",
]);

/**
 * Scan command for analyzing and registering existing plugins/mods.
 */
export const scanCommand = define({
  name: "scan",
  description: "Scan and register existing plugins/mods in project",
  options: {
    yes: {
      type: "boolean",
      short: "y",
      description: "Mark all as private (skip repository linking)",
    },
  },
  run: async (ctx) => {
    try {
      const yesValue = ctx.values.yes;
      const markAllPrivate = yesValue === true;

      // Check if project is initialized
      if (!isProjectInitialized()) {
        console.error(
          pc.red(pc.bold("Error:")) +
            " " +
            pc.red("No project.yml found. Run 'sks init' first.")
        );
        return;
      }

      const project = readProject();
      if (!project) {
        console.error(
          pc.red(pc.bold("Error:")) +
            " " +
            pc.red("Failed to read project.yml.")
        );
        return;
      }

      // Load repositories for searching
      loadRepositories();

      // Get the plugins/mods directory
      const pluginDir = getPluginDirectory(project.serverType, process.cwd());

      // Find all JAR files
      let jarFiles: string[] = [];
      try {
        const entries = readdirSync(pluginDir, { withFileTypes: true });
        jarFiles = entries
          .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jar"))
          .map((e) => e.name);
      } catch {
        console.log(
          pc.dim(`Directory ${pluginDir} does not exist or is empty.`)
        );
        return;
      }

      if (jarFiles.length === 0) {
        console.log(pc.dim("No JAR files found."));
        return;
      }

      console.log(
        pc.cyan(`Found ${jarFiles.length} JAR file(s) in ${pluginDir}`)
      );
      console.log("");

      // Get existing dependencies to skip already registered ones
      const existing = getDependencies();
      const existingFileNames = new Set(
        Object.values(existing)
          .map((dep) => dep.fileName)
          .filter(Boolean)
      );
      const loaders = getCompatibleLoaders(project.server.type);
      const searchOptions: SearchOptions = { loaders };
      const autoMatchCache = new Map<
        string,
        Promise<{ source: AutomaticSource; id: string } | null>
      >();

      // Analyze each JAR
      const spinner = ora({
        text: "Analyzing JAR files...",
        color: "cyan",
        spinner: cliSpinners.dots,
      }).start();

      let analyzedCount = 0;
      const results = await Promise.all(
        jarFiles.map(async (jarFile) => {
          const jarPath = join(pluginDir, jarFile);
          const isRegistered = existingFileNames.has(jarFile);
          const metadata = await analyzeJar(jarPath);

          analyzedCount += 1;
          spinner.text = `Analyzing JAR files... (${analyzedCount}/${jarFiles.length})`;

          if (metadata) {
            return {
              fileName: jarFile,
              name: metadata.name,
              version: metadata.version,
              type: metadata.type,
              isNew: !isRegistered,
            };
          }

          const parsed = parseJarFileName(jarFile);
          return {
            fileName: jarFile,
            name: parsed.name,
            version: parsed.version || "unknown",
            type: "unknown",
            isNew: !isRegistered,
          };
        })
      );

      spinner.succeed(`Analyzed ${results.length} JAR file(s)`);
      console.log("");

      // Show results
      const newPlugins = results.filter((r) => r.isNew);
      const existingPlugins = results.filter((r) => !r.isNew);

      if (existingPlugins.length > 0) {
        console.log(pc.dim(`Already registered: ${existingPlugins.length}`));
        for (const plugin of existingPlugins) {
          console.log(pc.dim(`  ✓ ${plugin.name} v${plugin.version}`));
        }
        console.log("");
      }

      if (newPlugins.length === 0) {
        console.log(pc.green("All plugins are already registered."));
        return;
      }

      console.log(pc.bold(`New plugins found: ${newPlugins.length}`));
      for (const plugin of newPlugins) {
        console.log(
          `  ${pc.cyan("+")} ${plugin.name} v${plugin.version} ${pc.dim(
            `(${plugin.type})`
          )}`
        );
      }
      console.log("");

      // If -y flag, mark all as private
      if (markAllPrivate) {
        for (const plugin of newPlugins) {
          addDependency(plugin.name, {
            source: "private",
            id: plugin.fileName,
            version: plugin.version,
            fileName: plugin.fileName,
          });
        }
        ora().succeed(`Registered ${newPlugins.length} plugin(s) as private`);
        return;
      }

      // Link each plugin interactively
      let registeredCount = 0;
      let skippedCount = 0;

      for (const plugin of newPlugins) {
        console.log(pc.bold(`\n${plugin.name} v${plugin.version}`));
        console.log(pc.dim(`File: ${plugin.fileName}`));

        const exactMatch = await findAutomaticRepositoryMatch(
          plugin,
          searchOptions,
          autoMatchCache
        );

        if (exactMatch) {
          const dependency: DependencyEntry = {
            source: exactMatch.source,
            id: exactMatch.id,
            version: plugin.version,
            fileName: plugin.fileName,
          };
          addDependency(plugin.name, dependency);
          ora(
            `  Exact match found on ${exactMatch.source}:${exactMatch.id}`
          ).succeed();
          registeredCount++;
          continue;
        }

        console.log(
          pc.dim("  No exact source match found. Choose where to search.")
        );

        let dependency: DependencyEntry | null = null;

        // Loop to allow going back to source selection
        while (dependency === null) {
          const source = await selectSource(plugin.name);

          if (source === "skip") {
            console.log(pc.dim("  Skipped"));
            skippedCount++;
            break;
          }

          if (source === "private") {
            dependency = {
              source: "private",
              id: plugin.fileName,
              version: plugin.version,
              fileName: plugin.fileName,
            };
          } else if (source === "custom") {
            // Custom search with user-provided query
            const customResult = await selectCustomSearch();
            if (!customResult) {
              // User cancelled or empty query, continue loop
              continue;
            }

            const linked = await linkToRepository(
              customResult.source,
              plugin,
              searchOptions,
              customResult.query
            );
            if (linked === null) {
              // User selected "None of these" - skipped
              console.log(pc.dim("  Skipped (no match selected)"));
              skippedCount++;
              break;
            } else if (linked === "back") {
              // User wants to go back to source selection
              continue;
            } else {
              dependency = {
                source: linked.source,
                id: linked.id,
                version: plugin.version,
                fileName: plugin.fileName,
              };
            }
          } else {
            // Search and link from repository
            const linked = await linkToRepository(source, plugin, searchOptions);
            if (linked === null) {
              // User selected "None of these" - skipped
              console.log(pc.dim("  Skipped (no match selected)"));
              skippedCount++;
              break;
            } else if (linked === "back") {
              // User wants to go back to source selection
              continue;
            } else {
              dependency = {
                source: linked.source,
                id: linked.id,
                version: plugin.version,
                fileName: plugin.fileName,
              };
            }
          }
        }

        if (dependency) {
          addDependency(plugin.name, dependency);
          ora(`  Linked to ${dependency.source}:${dependency.id}`).succeed();
          registeredCount++;
        }
      }

      console.log("");
      if (registeredCount > 0) {
        ora().succeed(`Registered ${registeredCount} plugin(s)`);
      }
      if (skippedCount > 0) {
        console.log(pc.dim(`Skipped ${skippedCount} plugin(s)`));
      }
    } catch (error) {
      if (isUserCancelError(error)) {
        console.log("");
        console.log(pc.red("❌ Operation canceled"));
        process.exit(0);
      }
      throw error;
    }
  },
});

/**
 * Prompt user to select a source for the plugin.
 */
export async function selectSource(pluginName: string): Promise<SourceType> {
  return await select({
    message: `Link "${pluginName}" to:`,
    choices: [
      { name: "🔍 Search Modrinth", value: "modrinth" as const },
      { name: "🔍 Search Spigot", value: "spigot" as const },
      { name: "🔍 Search GitHub", value: "github" as const },
      { name: "🔎 Custom search query", value: "custom" as const },
      { name: "🔒 Private (no updates)", value: "private" as const },
      { name: "⏭️  Skip for now", value: "skip" as const },
    ],
  });
}

/**
 * Prompt user for a custom search query and source.
 * Returns the selected source and custom query, or null if cancelled.
 */
export async function selectCustomSearch(): Promise<{
  source: "spigot" | "modrinth" | "github";
  query: string;
} | null> {
  const query = await input({
    message: "Enter search query:",
  });

  if (!query.trim()) {
    console.log(pc.dim("  No query entered"));
    return null;
  }

  const source = await select({
    message: "Search on:",
    choices: [
      { name: "Modrinth", value: "modrinth" as const },
      { name: "Spigot", value: "spigot" as const },
      { name: "GitHub", value: "github" as const },
    ],
  });

  return { source, query };
}

/**
 * Search repository and let user select a result.
 * Returns "back" if user wants to go back to source selection.
 * @param source Repository source
 * @param plugin Plugin information (used for default query)
 * @param options Search options
 * @param customQuery Optional custom query to use instead of plugin name
 */
export async function linkToRepository(
  source: SearchableSource,
  plugin: PluginInfo,
  options?: SearchOptions,
  customQuery?: string
): Promise<{ source: SearchableSource; id: string } | "back" | null> {
  const repo = getRepository(source);

  if (!repo) {
    console.log(pc.yellow(`  Repository ${source} not available`));
    return "back"; // Go back to source selection
  }

  const searchQuery = customQuery || plugin.name;
  const spinner = ora({
    text: `Searching ${source} for "${searchQuery}"...`,
    color: "cyan",
    spinner: cliSpinners.dots,
  }).start();

  let results: SearchResult[] = [];
  try {
    results = await repo.search(searchQuery, options);
  } catch {
    spinner.fail(`Failed to search ${source}`);
    return "back"; // Go back on error
  }

  spinner.stop();

  if (results.length === 0) {
    console.log(pc.dim(`  No results found on ${source}`));
    return "back"; // Go back if no results
  }

  // Let user select from results
  const choices: { name: string; value: string | null }[] = [
    ...results.slice(0, 10).map((r) => {
      const versionDisplay = r.version !== "latest" ? ` v${r.version}` : "";
      return {
        name: `${
          r.name
        }${versionDisplay} (${r.downloads.toLocaleString()} downloads)`,
        value: r.id,
      };
    }),
    { name: "⬅️  Go back", value: "back" as const },
    { name: "❌ None of these", value: null },
  ];

  const selectedId = await select({
    message: `Select matching plugin on ${source}:`,
    choices,
  });

  if (selectedId === "back") {
    return "back";
  }

  if (!selectedId) {
    return null;
  }

  // Check if the selected resource is external
  try {
    const resource = await repo.getResource(selectedId);
    if (resource.external) {
      console.log("");
      console.log(
        pc.yellow(pc.bold("⚠ Warning:")) +
          " " +
          pc.yellow("This resource is hosted externally.")
      );
      console.log(
        pc.dim("External resources cannot be automatically downloaded/updated.")
      );
      console.log(pc.dim(`URL: ${resource.url}`));
      console.log("");

      const proceed = await confirm({
        message: "Register this resource anyway?",
        default: false,
      });

      if (!proceed) {
        return "back"; // Go back to selection
      }
    }
  } catch {
    // Ignore errors checking resource details
  }

  return { source, id: selectedId };
}

function getRepository(source: SearchableSource) {
  const repoId = source === "spigot" ? "spiget" : source;
  return repositoryManager.get(repoId);
}

function normalizeExactMatchValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeVersionValue(value: string): string {
  return normalizeExactMatchValue(value).replace(/^v(?=\d)/, "");
}

function hasExactNameMatch(pluginName: string, resultName: string): boolean {
  return normalizeExactMatchValue(pluginName) === normalizeExactMatchValue(resultName);
}

function hasExactVersionMatch(
  pluginVersion: string,
  versions: VersionEntry[]
): boolean {
  const expected = normalizeVersionValue(pluginVersion);
  return versions.some(
    (version) => normalizeVersionValue(version.name) === expected
  );
}

function getAutomaticSourcePriority(
  options?: SearchOptions
): readonly AutomaticSource[] {
  if (
    options?.loaders &&
    options.loaders.length > 0 &&
    !options.loaders.some((loader) =>
      SPIGOT_COMPATIBLE_LOADERS.has(loader.toLowerCase())
    )
  ) {
    return ["modrinth"];
  }

  return AUTO_LINK_SOURCE_PRIORITY;
}

async function findAutomaticRepositoryMatch(
  plugin: PluginInfo,
  options: SearchOptions,
  cache: Map<string, Promise<{ source: AutomaticSource; id: string } | null>>
): Promise<{ source: AutomaticSource; id: string } | null> {
  if (!plugin.name.trim() || !plugin.version.trim() || plugin.version === "unknown") {
    return null;
  }

  const cacheKey = [
    normalizeExactMatchValue(plugin.name),
    normalizeVersionValue(plugin.version),
    [...(options.loaders || [])].sort().join(","),
  ].join("|");
  const cached = cache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const pending = (async () => {
    for (const source of getAutomaticSourcePriority(options)) {
      const match = await findExactRepositoryMatch(source, plugin, options);
      if (match) {
        return match;
      }
    }

    return null;
  })();

  cache.set(cacheKey, pending);

  try {
    return await pending;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

async function findExactRepositoryMatch(
  source: AutomaticSource,
  plugin: PluginInfo,
  options?: SearchOptions
): Promise<{ source: AutomaticSource; id: string } | null> {
  const repo = getRepository(source);
  if (!repo) {
    return null;
  }

  let results: SearchResult[] = [];
  try {
    results = await repo.search(plugin.name, {
      ...options,
      resolveLatestVersion: false,
    });
  } catch {
    return null;
  }

  const exactCandidates = results.filter((result) =>
    hasExactNameMatch(plugin.name, result.name)
  );

  for (const candidate of exactCandidates) {
    let versions: VersionEntry[] = [];
    try {
      versions = await repo.getVersions(candidate.id);
    } catch {
      continue;
    }

    if (!hasExactVersionMatch(plugin.version, versions)) {
      continue;
    }

    if (source === "spigot") {
      try {
        const resource = await repo.getResource(candidate.id);
        if (resource.external) {
          continue;
        }
      } catch {
        continue;
      }
    }

    return { source, id: candidate.id };
  }

  return null;
}
