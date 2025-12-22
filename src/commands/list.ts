import { define } from "gunshi";
import { readdirSync } from "node:fs";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { readProject, getDependencies } from "../lib/project";
import { getPluginDirectory } from "../lib/downloader";

/**
 * List command for displaying installed plugins/mods.
 */
export const listCommand = define({
  name: "list",
  description: "List installed plugins/mods",
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

    // Show spinner while loading
    const spinner = ora({
      text: "Loading plugins...",
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    // Get dependencies from project.yml
    const dependencies = getDependencies();
    const dependencyNames = Object.keys(dependencies);

    // Get plugin directory
    const pluginDir = getPluginDirectory(project.serverType, process.cwd());

    // Get all JAR files in plugin directory
    let jarFiles: string[] = [];
    try {
      const files = readdirSync(pluginDir);
      jarFiles = files.filter((f) => f.toLowerCase().endsWith(".jar"));
    } catch {
      // Plugin directory doesn't exist or not accessible
    }

    spinner.stop();

    // Find registered file names
    const registeredFiles = new Set<string>();
    for (const dep of Object.values(dependencies)) {
      if (dep?.fileName) {
        registeredFiles.add(dep.fileName.toLowerCase());
      }
    }

    // Find untracked JAR files
    const untrackedFiles = jarFiles.filter(
      (f) => !registeredFiles.has(f.toLowerCase())
    );

    // Group dependencies by source
    const groupedBySource: Record<string, { name: string; version: string }[]> =
      {};
    for (const name of dependencyNames) {
      const dep = dependencies[name];
      if (dep) {
        const source = dep.source || "unknown";
        if (!groupedBySource[source]) {
          groupedBySource[source] = [];
        }
        groupedBySource[source].push({ name, version: dep.version });
      }
    }

    // Display registered dependencies grouped by source
    if (dependencyNames.length > 0) {
      console.log(pc.bold(pc.cyan("Installed:")));

      // Define source display order
      const sourceOrder = ["spigot", "modrinth", "github", "private"];
      const sortedSources = Object.keys(groupedBySource).sort((a, b) => {
        const aIndex = sourceOrder.indexOf(a);
        const bIndex = sourceOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      for (const source of sortedSources) {
        const plugins = groupedBySource[source];
        if (!plugins || plugins.length === 0) continue;

        // Display source header with capitalized name
        const sourceDisplay = source.charAt(0).toUpperCase() + source.slice(1);
        console.log(`  ${pc.dim(sourceDisplay + ":")}`);

        for (const plugin of plugins) {
          console.log(
            "    " +
              pc.green("●") +
              " " +
              pc.bold(plugin.name) +
              " " +
              pc.dim(`(v${plugin.version})`)
          );
        }
      }
    } else {
      console.log(pc.dim("No dependencies installed."));
    }

    // Display untracked JAR files
    if (untrackedFiles.length > 0) {
      console.log("");
      console.log(pc.bold(pc.yellow("Untracked:")));
      for (const file of untrackedFiles) {
        console.log(
          "  " +
            pc.yellow("○") +
            " " +
            file +
            " " +
            pc.dim("(run 'sks scan' to register)")
        );
      }
    }

    // Summary
    console.log("");
    console.log(
      pc.dim(
        `${dependencyNames.length} registered, ${untrackedFiles.length} untracked`
      )
    );
  },
});
