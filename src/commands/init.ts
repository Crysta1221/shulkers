import { define } from "gunshi";
import { basename } from "node:path";
import pc from "picocolors";
import { input, select, confirm } from "@inquirer/prompts";
import ora from "ora";
import cliSpinners from "cli-spinners";
import {
  type ServerType,
  type ProjectConfig,
  writeProject,
  readProject,
  detectFromDockerCompose,
  detectJarFiles,
  getJarVersion,
  getServerCategory,
} from "../lib/project";
import {
  getLocalShulkersDir,
  getLocalRepositoryDir,
  ensureDir,
  isProjectInitialized,
} from "../lib/paths";

/** Available server types for selection */
const SERVER_TYPES: { name: string; value: ServerType; description: string }[] =
  [
    {
      name: "Paper",
      value: "paper",
      description: "High performance Spigot fork",
    },
    { name: "Spigot", value: "spigot", description: "Popular Bukkit fork" },
    {
      name: "Vanilla",
      value: "vanilla",
      description: "Official Minecraft server",
    },
    {
      name: "Forge",
      value: "forge",
      description: "Mod loader for Java Edition",
    },
    { name: "Fabric", value: "fabric", description: "Lightweight mod loader" },
    {
      name: "NeoForge",
      value: "neoforge",
      description: "Community fork of Forge",
    },
    {
      name: "Purpur",
      value: "purpur",
      description: "Paper fork with extra features",
    },
    {
      name: "Velocity",
      value: "velocity",
      description: "Modern Minecraft proxy",
    },
    {
      name: "BungeeCord",
      value: "bungeecord",
      description: "Classic Minecraft proxy",
    },
    {
      name: "Waterfall",
      value: "waterfall",
      description: "BungeeCord fork with improvements (deprecated!)",
    },
  ];

/**
 * Parse memory string to validate format.
 * @param value Memory string (e.g., "2G", "1024M")
 */
function isValidMemory(value: string): boolean {
  return /^\d+[MmGg]$/.test(value);
}

/**
 * Validate semantic version format.
 * @param value Version string (e.g., "1.21", "1.20.1", "1.19.4")
 */
function isValidVersion(value: string): boolean {
  // Semantic version: major.minor or major.minor.patch
  // Allow optional snapshot/pre-release suffix
  return /^\d+\.\d+(\.\d+)?(-[\w.]+)?$/.test(value);
}

/**
 * Init command definition.
 * Initializes a new Shulkers project with interactive prompts.
 */
export default define({
  name: "init",
  description: "Initialize a new Shulkers project",
  args: {
    yes: {
      type: "boolean",
      short: "y",
      description: "Execute all interactions automatically",
    },
    override: {
      type: "boolean",
      description: "Override existing project configuration",
    },
  },
  run: async (ctx) => {
    try {
      const cwd = process.cwd();
      const defaultName = basename(cwd);

      // Check if project already exists
      if (isProjectInitialized() && !ctx.values.override) {
        const existing = readProject();
        console.log(
          pc.yellow(
            `Project "${
              existing?.name || "unknown"
            }" already exists in this directory.`
          )
        );
        const overwrite = await confirm({
          message: "Do you want to overwrite it?",
          default: false,
        });

        if (!overwrite) {
          console.log(pc.dim("Initialization cancelled."));
          return;
        }
      }

      let config: ProjectConfig;

      // Auto-detect from docker-compose.yml
      const dockerInfo = detectFromDockerCompose();

      // Use default values if --yes flag is set
      if (ctx.values.yes) {
        // Detect JAR files (even with -y flag)
        const jarFiles = detectJarFiles();
        let selectedJar: string | undefined;
        let jarInfo: { type: ServerType; version: string } | null = null;

        // Analyze JAR if found
        if (jarFiles.length > 0) {
          selectedJar = jarFiles[0]; // Use first JAR file
          if (selectedJar) {
            const spinner = ora({
              text: `Analyzing ${selectedJar}...`,
              color: "cyan",
              spinner: cliSpinners.dots,
            }).start();
            jarInfo = await getJarVersion(selectedJar);
            if (jarInfo) {
              spinner.succeed(
                `Detected ${jarInfo.type} ${jarInfo.version} from ${selectedJar}`
              );
            } else {
              spinner.warn(`Could not detect version from ${selectedJar}`);
            }
          }
        }

        const detectedType = dockerInfo?.type || jarInfo?.type;
        const detectedVersion = dockerInfo?.version || jarInfo?.version;

        config = {
          name: defaultName,
          description: "",
          serverType: getServerCategory(detectedType || "paper"),
          server: {
            type: detectedType || "paper",
            version: detectedVersion || "1.21",
            memory: {
              min: "1G",
              max: "2G",
            },
          },
        };
      } else {
        // Interactive mode: ask for name and description first
        const name = await input({
          message: "Project name:",
          default: defaultName,
        });

        const description = await input({
          message: "Project description (optional):",
          default: "",
        });

        // Then detect and analyze JARs
        const jarFiles = detectJarFiles();
        let selectedJar: string | undefined;
        let jarInfo: { type: ServerType; version: string } | null = null;

        // Analyze JAR if found
        if (jarFiles.length > 0) {
          if (jarFiles.length === 1) {
            selectedJar = jarFiles[0];
            console.log(pc.cyan(`Found JAR file: ${selectedJar}`));
          } else {
            selectedJar = await select({
              message: "Multiple JAR files found. Select one:",
              choices: [
                ...jarFiles.map((jar) => ({ name: jar, value: jar })),
                { name: "None (manual configuration)", value: undefined },
              ],
            });
          }

          // Get version info from selected JAR
          if (selectedJar) {
            const spinner = ora({
              text: `Analyzing ${selectedJar}...`,
              color: "cyan",
              spinner: cliSpinners.dots,
            }).start();
            jarInfo = await getJarVersion(selectedJar);
            if (jarInfo) {
              spinner.succeed(
                `Detected ${jarInfo.type} ${jarInfo.version} from ${selectedJar}`
              );
            } else {
              spinner.warn(
                `Could not detect version from ${selectedJar}. Please enter manually.`
              );
            }
          }
        }

        // Show docker detection if found
        if (dockerInfo) {
          console.log(
            pc.cyan(
              `Detected ${dockerInfo.type} ${dockerInfo.version} from docker-compose.yml`
            )
          );
        }

        const detectedType = dockerInfo?.type || jarInfo?.type;
        const detectedVersion = dockerInfo?.version || jarInfo?.version;

        // Skip server type selection if detected
        let serverType: ServerType;
        if (detectedType) {
          serverType = detectedType;
          console.log(pc.dim(`Using detected server type: ${serverType}`));
        } else {
          serverType = await select({
            message: "Select server type:",
            choices: SERVER_TYPES.map((type) => ({
              name: `${type.name} - ${type.description}`,
              value: type.value,
              description: type.description,
            })),
            default: "paper",
          });
        }

        // Skip version input if detected
        let serverVersion: string;
        if (detectedVersion) {
          serverVersion = detectedVersion;
          console.log(pc.dim(`Using detected version: ${serverVersion}`));
        } else {
          serverVersion = await input({
            message: "Server version:",
            default: "1.21",
            validate: (value) =>
              isValidVersion(value) ||
              "Invalid version format. Use semantic versioning like 1.21 or 1.20.1",
          });
        }

        let jarPath: string | undefined;
        if (!dockerInfo) {
          jarPath = await input({
            message: "Server JAR file path (leave empty if using Docker):",
            default: selectedJar || "",
          });
        }

        const minMemory = await input({
          message: "Minimum memory (e.g., 1G, 1024M):",
          default: "1G",
          validate: (value) =>
            isValidMemory(value) ||
            "Invalid format. Use format like 1G or 1024M",
        });

        const maxMemory = await input({
          message: "Maximum memory (e.g., 2G, 2048M):",
          default: "2G",
          validate: (value) =>
            isValidMemory(value) ||
            "Invalid format. Use format like 2G or 2048M",
        });

        config = {
          name,
          description,
          serverType: getServerCategory(serverType),
          server: {
            type: serverType,
            version: serverVersion,
            jarPath: jarPath || undefined,
            memory: {
              min: minMemory,
              max: maxMemory,
            },
          },
        };
      }

      // Create directories
      ensureDir(getLocalShulkersDir());
      ensureDir(getLocalRepositoryDir());

      // Write configuration
      writeProject(config);

      ora().succeed("Project initialized successfully!");
      console.log(pc.dim(`Configuration saved to .shulkers/project.yml\n`));
      console.log(pc.bold("Project Configuration:"));
      console.log(`  ${pc.cyan("Name:")} ${config.name}`);
      if (config.description) {
        console.log(`  ${pc.cyan("Description:")} ${config.description}`);
      }
      console.log(`  ${pc.cyan("Server Type:")} ${config.server.type}`);
      console.log(`  ${pc.cyan("Server Version:")} ${config.server.version}`);
      if (config.server.jarPath) {
        console.log(`  ${pc.cyan("JAR Path:")} ${config.server.jarPath}`);
      }
      console.log(
        `  ${pc.cyan("Memory:")} ${config.server.memory.min} - ${
          config.server.memory.max
        }`
      );
      console.log("");
    } catch (error) {
      // Handle user cancellation (Ctrl+C)
      if (error instanceof Error && error.message.includes("force closed")) {
        console.log("");
        console.log(pc.red("❌ Operation canceled"));
        process.exit(0);
      }
      // Re-throw other errors
      throw error;
    }
  },
});
