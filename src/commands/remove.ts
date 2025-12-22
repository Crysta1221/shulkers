import { define } from "gunshi";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { readProject, removeDependency, getDependencies } from "../lib/project";
import { getPluginDirectory } from "../lib/downloader";
import { isUserCancelError } from "../lib/prompts";

/**
 * Known command aliases to filter from positionals.
 */
const commandAliases = new Set(["remove", "rm", "uninstall"]);

/**
 * Remove command for uninstalling plugins/mods.
 */
export const removeCommand = define({
  name: "remove",
  description: "Remove an installed plugin or mod",
  args: {
    target: {
      type: "positional",
      description: "Plugin name(s) to remove",
      required: true,
    },
  },
  run: async (ctx) => {
    try {
      // Get all positional args as targets, filtering out command names
      const targets =
        ctx.positionals?.filter(
          (t) => typeof t === "string" && !commandAliases.has(t)
        ) || [];

      if (targets.length === 0) {
        console.error(
          pc.red(pc.bold("Error:")) +
            " " +
            pc.red("Please specify what to remove.")
        );
        console.log(pc.dim("Usage: sks remove <plugin1> [plugin2] ..."));
        console.log(pc.dim("Example: sks remove vault viaversion"));
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

      // Get dependencies
      const dependencies = getDependencies();

      if (Object.keys(dependencies).length === 0) {
        console.log(pc.dim("No dependencies installed."));
        return;
      }

      // Get plugin directory
      const pluginDir = getPluginDirectory(project.serverType, process.cwd());

      // Process each target
      for (const target of targets) {
        // Find dependency by name (case-insensitive)
        const lowerTarget = target.toLowerCase();
        const matchingName = Object.keys(dependencies).find(
          (name) => name.toLowerCase() === lowerTarget
        );

        if (!matchingName) {
          console.log(
            pc.red("-") + " " + pc.red(target) + " " + pc.dim("(not found)")
          );
          continue;
        }

        const dependency = dependencies[matchingName];
        if (!dependency) {
          console.log(
            pc.red("-") +
              " " +
              pc.red(matchingName) +
              " " +
              pc.dim("(corrupted)")
          );
          continue;
        }

        // Delete JAR file if it exists
        if (dependency.fileName) {
          const filePath = join(pluginDir, dependency.fileName);

          if (existsSync(filePath)) {
            try {
              await unlink(filePath);
            } catch {
              // Ignore file deletion errors, just remove from project.yml
            }
          }
        }

        // Remove from project.yml
        removeDependency(matchingName);

        // Output in "- name (v x.x.x)" format
        console.log(
          pc.red("-") +
            " " +
            pc.bold(matchingName) +
            " " +
            pc.dim(`(v${dependency.version})`)
        );

        // Remove from local dependencies object to prevent duplicate processing
        delete dependencies[matchingName];
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
