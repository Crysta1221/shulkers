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
import type { SearchResult } from "../lib/repositories/types";
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

      // Analyze each JAR
      const spinner = ora({
        text: "Analyzing JAR files...",
        color: "cyan",
        spinner: cliSpinners.dots,
      }).start();

      const results: PluginInfo[] = [];

      for (const jarFile of jarFiles) {
        const jarPath = join(pluginDir, jarFile);
        const isRegistered = existingFileNames.has(jarFile);

        spinner.text = `Analyzing ${jarFile}...`;

        const metadata = await analyzeJar(jarPath);

        if (metadata) {
          results.push({
            fileName: jarFile,
            name: metadata.name,
            version: metadata.version,
            type: metadata.type,
            isNew: !isRegistered,
          });
        } else {
          // Fallback to filename parsing
          const parsed = parseJarFileName(jarFile);
          results.push({
            fileName: jarFile,
            name: parsed.name,
            version: parsed.version || "unknown",
            type: "unknown",
            isNew: !isRegistered,
          });
        }
      }

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

            const loaders = getCompatibleLoaders(project.server.type);
            const linked = await linkToRepository(
              customResult.source,
              plugin,
              { loaders },
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
            const loaders = getCompatibleLoaders(project.server.type);
            const linked = await linkToRepository(source, plugin, { loaders });
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
      { name: "🔍 Search Spigot", value: "spigot" as const },
      { name: "🔍 Search Modrinth", value: "modrinth" as const },
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
      { name: "Spigot", value: "spigot" as const },
      { name: "Modrinth", value: "modrinth" as const },
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
  source: "spigot" | "modrinth" | "github",
  plugin: PluginInfo,
  options?: { loaders?: string[] },
  customQuery?: string
): Promise<
  { source: "spigot" | "modrinth" | "github"; id: string } | "back" | null
> {
  const repoId = source === "spigot" ? "spiget" : source;
  const repo = repositoryManager.get(repoId);

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
