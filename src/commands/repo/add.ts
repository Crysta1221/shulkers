import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import { addGitHubRepo, getGitHubRepos } from "../../lib/config";
import { isProjectInitialized } from "../../lib/paths";
import { isUserCancelError } from "../../lib/prompts";
import { input, confirm } from "@inquirer/prompts";

/**
 * Check if the source is a GitHub repository URL.
 */
function isGitHubUrl(source: string): boolean {
  return /github\.com\/[^/]+\/[^/]+/.test(source);
}

/**
 * Extract repository name from GitHub URL.
 */
function extractRepoName(url: string): string {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match || !match[2]) {
    return "Unknown Project";
  }
  // Remove .git suffix if present
  return match[2].replace(/\.git$/, "");
}

/**
 * Handle GitHub repository URL.
 */
async function handleGitHubUrl(url: string, isGlobal: boolean): Promise<void> {
  console.log(pc.cyan("Detected GitHub repository URL!"));

  // Extract default project name
  const defaultName = extractRepoName(url);

  // Check if already exists
  const existingRepos = getGitHubRepos(isGlobal);
  if (existingRepos.some((r) => r.url === url)) {
    console.error(
      pc.red(pc.bold("Error:")) +
        " " +
        pc.red(`GitHub repository ${url} already exists.`)
    );
    return;
  }

  // Ask for project name
  const name = await input({
    message: "Enter a display name for this project:",
    default: defaultName,
  });

  // Confirm addition
  const shouldAdd = await confirm({
    message: `Add ${pc.green(name)} (${url}) to github.yml?`,
    default: true,
  });

  if (!shouldAdd) {
    console.log(pc.dim("Cancelled."));
    return;
  }

  // Add to github.yml
  addGitHubRepo(url, name, isGlobal);

  const location = isGlobal ? "globally" : "locally";
  ora().succeed(`GitHub repository '${name}' added ${location}!`);
  console.log(pc.dim(`  URL: ${url}`));
  console.log(pc.dim(`  Saved to: github.yml`));
}

/**
 * Repository add command definition.
 * Adds a GitHub repository URL only.
 * External repository configurations are not allowed for security reasons.
 */
export default define({
  name: "add",
  description: "Add a GitHub repository",
  args: {
    global: {
      type: "boolean",
      short: "g",
      description: "Install repository globally (to ~/.shulkers/repository)",
    },
    source: {
      type: "positional",
      description: "GitHub repository URL",
      required: true,
    },
  },
  run: async (ctx) => {
    const source = ctx.positionals[0];
    const isGlobal = ctx.values.global ?? false;

    if (!source) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("GitHub repository URL is required.")
      );
      console.log(pc.dim("Usage: sks repo add <github-url> [--global]"));
      console.log(
        pc.dim("Example: sks repo add https://github.com/owner/repo")
      );
      return;
    }

    // Check if project is initialized for local installation
    if (!isGlobal && !isProjectInitialized()) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("No shulkers project found in current directory.")
      );
      console.log(
        pc.dim(
          "Run 'sks init' first or use '--global' flag to install globally."
        )
      );
      return;
    }

    // Only allow GitHub repository URLs for security reasons
    if (!isGitHubUrl(source)) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red(
            "Only GitHub repository URLs are allowed for security reasons."
          )
      );
      console.log(pc.dim("Usage: sks repo add <github-url> [--global]"));
      console.log(
        pc.dim("Example: sks repo add https://github.com/owner/repo")
      );
      return;
    }

    try {
      await handleGitHubUrl(source, isGlobal);
    } catch (e) {
      if (isUserCancelError(e)) {
        console.log("");
        ora().fail("Operation canceled");
        process.exit(0);
      }
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red(
            `Failed to add repository. ${
              e instanceof Error ? e.message : String(e)
            }`
          )
      );
    }
  },
});
