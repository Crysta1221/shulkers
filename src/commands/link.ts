import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import { select } from "@inquirer/prompts";
import { readProject, addDependency, getDependencies } from "../lib/project";
import { isProjectInitialized } from "../lib/paths";
import { loadRepositories } from "../lib/config";
import { isUserCancelError } from "../lib/prompts";
import { selectSource, linkToRepository, selectCustomSearch } from "./scan";
import { getCompatibleLoaders } from "../lib/server-utils";

/**
 * Find a dependency by name with case-insensitive matching.
 * Returns the actual key name in the dependencies object.
 */
function findDependencyKey(
  dependencies: Record<string, unknown>,
  targetName: string
): string | null {
  const lowerTarget = targetName.toLowerCase();
  for (const key of Object.keys(dependencies)) {
    if (key.toLowerCase() === lowerTarget) {
      return key;
    }
  }
  return null;
}

/**
 * Link command for re-associating plugins/mods.
 */
export const linkCommand = define({
  name: "link",
  description: "Link or re-link a plugin/mod to a remote repository",
  args: {
    target: {
      type: "positional",
      description: "Plugin/mod name or search query",
    },
  },
  run: async (ctx) => {
    try {
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

      loadRepositories();

      const dependencies = getDependencies();
      const depNames = Object.keys(dependencies);

      if (depNames.length === 0) {
        console.log(pc.yellow("No plugins/mods found in project.yml."));
        return;
      }

      let targetName =
        typeof ctx.values.target === "string" ? ctx.values.target : undefined;
      let actualKey: string | null = null;

      // Select target if not provided
      if (!targetName) {
        targetName = await select({
          message: "Select plugin/mod to link:",
          choices: depNames.map((name) => {
            const d = dependencies[name];
            return {
              name: `${name} ${pc.dim(`(${d?.source || "?"})`)}`,
              value: name,
            };
          }),
        });
        actualKey = targetName;
      } else {
        // Try case-insensitive match
        actualKey = findDependencyKey(dependencies, targetName);
      }

      if (!actualKey || !dependencies[actualKey]) {
        console.error(
          pc.red(pc.bold("Error:")) +
            " " +
            pc.red(`Plugin "${targetName}" not found in project.yml.`)
        );
        console.log(pc.dim("Run 'sks list' to see registered plugin names."));
        return;
      }

      const dep = dependencies[actualKey];
      // Note: dep is guaranteed to be defined here due to check above, but TS might need help
      if (!dep) return;

      console.log(pc.bold(`\nLinking ${actualKey} v${dep.version}`));
      console.log(pc.dim(`Current: ${dep.source}:${dep.id}`));

      // PluginInfo wrapper to adapt to linkToRepository
      const pluginInfo = {
        fileName: dep.fileName || `${actualKey}.jar`,
        name: actualKey,
        version: dep.version || "unknown",
        type: "unknown",
        isNew: false,
      };

      let newDependency = null;

      while (newDependency === null) {
        const source = await selectSource(actualKey);

        if (source === "skip") {
          console.log(pc.dim("canceled"));
          return;
        }

        if (source === "private") {
          newDependency = {
            ...dep,
            source: "private",
            id: dep.fileName || `${actualKey}.jar`,
          } as import("../lib/project").DependencyEntry;
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
            pluginInfo,
            { loaders },
            customResult.query
          );

          if (linked === null) {
            console.log(pc.dim("  Skipped (no match selected)"));
            // Continue loop
          } else if (linked === "back") {
            // Continue loop
          } else {
            newDependency = {
              ...dep,
              source: linked.source,
              id: linked.id,
            };
          }
        } else {
          const loaders = getCompatibleLoaders(project.server.type);
          const linked = await linkToRepository(source, pluginInfo, {
            loaders,
          });

          if (linked === null) {
            console.log(pc.dim("  Skipped (no match selected)"));
            // Continue loop
          } else if (linked === "back") {
            // Continue loop
          } else {
            newDependency = {
              ...dep,
              source: linked.source,
              id: linked.id,
            };
          }
        }
      }

      if (newDependency) {
        addDependency(actualKey, newDependency);
        ora().succeed(
          `updated ${actualKey} -> ${newDependency.source}:${newDependency.id}`
        );
      }
    } catch (error) {
      if (isUserCancelError(error)) {
        console.log("");
        ora().fail("Operation canceled");
        process.exit(0);
      }
      throw error;
    }
  },
});
