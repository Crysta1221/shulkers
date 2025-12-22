import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { repositoryManager } from "../../lib/repositories/manager";
import { getRepositories, getGitHubRepos } from "../../lib/config";
import { isProjectInitialized } from "../../lib/paths";

/**
 * Format asset types for display.
 */
function formatAssetTypes(types: ("mod" | "plugin")[]): string {
  if (types.includes("mod") && types.includes("plugin")) {
    return pc.cyan("mod") + ", " + pc.green("plugin");
  }
  if (types.includes("mod")) {
    return pc.cyan("mod");
  }
  return pc.green("plugin");
}

/**
 * Repository list command definition.
 * Lists all registered repositories (built-in, global, and local).
 */
export default define({
  name: "list",
  description: "List all registered repositories",
  args: {
    global: {
      type: "boolean",
      short: "g",
      description: "Show only global repositories",
    },
    local: {
      type: "boolean",
      short: "l",
      description: "Show only local repositories",
    },
  },
  run: async (ctx) => {
    const showGlobal = ctx.values.global ?? false;
    const showLocal = ctx.values.local ?? false;
    const showAll = !showGlobal && !showLocal;

    const spinner = ora({
      text: "Loading repositories...",
      spinner: cliSpinners.dots,
      color: "cyan",
    }).start();

    // Small delay to show spinner for fast operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    spinner.stop();

    // Built-in repositories
    const builtIn = repositoryManager
      .getAll()
      .filter((r) => r.id === "spiget" || r.id === "modrinth");

    console.log(pc.cyan(pc.bold("Built-in Repositories:")));
    for (const repo of builtIn) {
      const types = formatAssetTypes(repo.assetTypes);
      console.log(
        `  - ${pc.green(repo.name)} ${pc.dim(`(${repo.id})`)} [${types}]`
      );
    }

    // Global repositories
    if (showAll || showGlobal) {
      const globalRepos = getRepositories(true);
      if (globalRepos.length > 0) {
        console.log(pc.cyan(pc.bold("\nGlobal Repositories:")));
        for (const repo of globalRepos) {
          console.log(
            `  - ${pc.green(repo.name)} ${pc.dim(`(${repo.id})`)}: ${
              repo.baseUrl
            } [${pc.green("plugin")}]`
          );
        }
      } else {
        console.log(pc.dim("\nNo global repositories found."));
      }
    }

    // Local repositories
    if (showAll || showLocal) {
      if (isProjectInitialized()) {
        const localRepos = getRepositories(false);
        if (localRepos.length > 0) {
          console.log(pc.cyan(pc.bold("\nLocal Repositories:")));
          for (const repo of localRepos) {
            console.log(
              `  - ${pc.green(repo.name)} ${pc.dim(`(${repo.id})`)}: ${
                repo.baseUrl
              } [${pc.green("plugin")}]`
            );
          }
        } else {
          console.log(pc.dim("\nNo local repositories found."));
        }
      } else if (!showGlobal) {
        console.log(
          pc.dim(
            "\nNo project initialized. Run 'sks init' to create a project."
          )
        );
      }
    }

    // GitHub repositories (global)
    if (showAll || showGlobal) {
      const globalGitHubRepos = getGitHubRepos(true);
      if (globalGitHubRepos.length > 0) {
        console.log(pc.cyan(pc.bold("\nGlobal GitHub Repositories:")));
        for (const repo of globalGitHubRepos) {
          console.log(
            `  - ${pc.green(repo.name)}: ${pc.dim(repo.url)} [${pc.green(
              "plugin"
            )}]`
          );
        }
      }
    }

    // GitHub repositories (local)
    if (showAll || showLocal) {
      if (isProjectInitialized()) {
        const localGitHubRepos = getGitHubRepos(false);
        if (localGitHubRepos.length > 0) {
          console.log(pc.cyan(pc.bold("\nLocal GitHub Repositories:")));
          for (const repo of localGitHubRepos) {
            console.log(
              `  - ${pc.green(repo.name)}: ${pc.dim(repo.url)} [${pc.green(
                "plugin"
              )}]`
            );
          }
        }
      }
    }

    console.log("");
  },
});
