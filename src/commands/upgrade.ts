import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import cliSpinners from "cli-spinners";
import { confirm } from "@inquirer/prompts";
import { checkForUpdates, getCurrentVersion } from "../lib/version-checker";
import {
  canSelfUpdate,
  findPlatformAsset,
  downloadUpdate,
  replaceExecutable,
  getTempDownloadPath,
  getCurrentExecutablePath,
  detectPlatform,
} from "../lib/self-updater";
import { formatBytes } from "../lib/downloader";
import { isUserCancelError } from "../lib/prompts";

/**
 * Upgrade command for updating Shulkers CLI to the latest version.
 */
export const upgradeCommand = define({
  name: "upgrade",
  description: "Upgrade Shulkers CLI to the latest version",
  args: {
    force: {
      type: "boolean",
      short: "f",
      description: "Force reinstall even if already on latest version",
    },
    check: {
      type: "boolean",
      short: "c",
      description: "Only check for updates without installing",
    },
  },
  run: async (ctx) => {
    try {
      const force = ctx.values.force === true;
      const checkOnly = ctx.values.check === true;

      // Check for updates
      const spinner = ora({
        text: "Checking for updates...",
        spinner: cliSpinners.dots,
        color: "cyan",
      }).start();

      const updateInfo = await checkForUpdates(true);

      if (!updateInfo) {
        spinner.fail("Failed to check for updates");
        console.log(pc.dim("Check your internet connection and try again."));
        return;
      }

      const currentVersion = getCurrentVersion();
      const { latestVersion, hasUpdate, releaseUrl } = updateInfo;

      if (!hasUpdate && !force) {
        spinner.succeed(
          `Already on the latest version (${pc.green(`v${currentVersion}`)})`
        );
        return;
      }

      if (hasUpdate) {
        spinner.succeed(
          `New version available: ${pc.green(
            `v${latestVersion}`
          )} (current: ${pc.dim(`v${currentVersion}`)})`
        );
      } else {
        spinner.succeed(
          `Current version: ${pc.green(`v${currentVersion}`)} (force reinstall)`
        );
      }

      // Check only mode
      if (checkOnly) {
        if (hasUpdate) {
          console.log("");
          console.log(pc.cyan("Release URL:") + " " + pc.underline(releaseUrl));
          console.log("");
          console.log(
            pc.dim(`Run ${pc.bold("sks upgrade")} to install the update.`)
          );
        }
        return;
      }

      // Check if self-update is possible
      if (!canSelfUpdate()) {
        console.log("");
        console.log(
          pc.yellow("Note:") +
            " " +
            pc.yellow(
              "Self-update is not available when running via bun/node directly."
            )
        );
        console.log("");
        console.log("To update, please run the install script:");
        console.log("");

        const platform = detectPlatform();
        if (platform === "windows-x64") {
          console.log(
            pc.cyan(
              "  irm https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.ps1 | iex"
            )
          );
        } else {
          console.log(
            pc.cyan(
              "  curl -fsSL https://raw.githubusercontent.com/Crysta1221/shulkers/main/scripts/install.sh | bash"
            )
          );
        }
        console.log("");
        return;
      }

      // Find platform asset
      const asset = findPlatformAsset(updateInfo);
      if (!asset) {
        console.log("");
        console.log(
          pc.red("Error:") +
            " " +
            pc.red(
              `No binary available for your platform (${detectPlatform()})`
            )
        );
        console.log(
          pc.dim("Please download manually from: ") + pc.underline(releaseUrl)
        );
        return;
      }

      // Confirm update
      console.log("");
      const proceed = await confirm({
        message: `Download and install v${latestVersion}?`,
        default: true,
      });

      if (!proceed) {
        console.log(pc.dim("Upgrade cancelled."));
        return;
      }

      // Download new version
      const downloadSpinner = ora({
        text: "Downloading update...",
        spinner: cliSpinners.dots,
        color: "cyan",
      }).start();

      const tempPath = getTempDownloadPath();
      let lastProgress = 0;

      try {
        await downloadUpdate(asset.url, tempPath, (downloaded, total) => {
          const progress = Math.floor((downloaded / total) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            downloadSpinner.text = `Downloading update... ${progress}% (${formatBytes(
              downloaded
            )}/${formatBytes(total)})`;
          }
        });

        downloadSpinner.succeed(
          `Downloaded ${asset.fileName} (${formatBytes(
            updateInfo.assets.find((a) => a.name === asset.fileName)?.size ?? 0
          )})`
        );
      } catch (error) {
        downloadSpinner.fail("Download failed");
        console.error(
          pc.red("Error:") +
            " " +
            pc.red(error instanceof Error ? error.message : String(error))
        );
        return;
      }

      // Install update
      const installSpinner = ora({
        text: "Installing update...",
        spinner: cliSpinners.dots,
        color: "cyan",
      }).start();

      try {
        const currentPath = getCurrentExecutablePath();
        replaceExecutable(currentPath, tempPath);

        installSpinner.succeed("Update installed successfully!");
        console.log("");
        console.log(
          pc.green("✨") +
            " " +
            pc.bold(`Shulkers has been updated to v${latestVersion}`)
        );
        console.log(
          pc.dim("Run ") +
            pc.cyan("sks --version") +
            pc.dim(" to verify the update.")
        );
      } catch (error) {
        installSpinner.fail("Installation failed");
        console.error(
          pc.red("Error:") +
            " " +
            pc.red(error instanceof Error ? error.message : String(error))
        );
        console.log("");
        console.log(
          pc.dim("You may need to run with elevated permissions (sudo/admin).")
        );
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
