import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { parse, stringify } from "yaml";
import { getLocalShulkersDir, getProjectFilePath, ensureDir } from "./paths";

/** Supported server types */
export type ServerType =
  | "vanilla"
  | "spigot"
  | "paper"
  | "forge"
  | "fabric"
  | "neoforge"
  | "purpur"
  | "velocity"
  | "bungeecord"
  | "waterfall";

/** Server category type */
export type ServerCategory = "plugin" | "mod" | "proxy";

/** Memory configuration for server */
export interface MemoryConfig {
  min: string;
  max: string;
}

/** Server configuration */
export interface ServerConfig {
  type: ServerType;
  version: string;
  jarPath?: string;
  memory: MemoryConfig;
}

/** Plugin/Mod dependency entry */
export interface DependencyEntry {
  source: "spigot" | "modrinth" | "github" | "local" | "private";
  id: string;
  version: string;
  fileName?: string;
}

/** Project configuration stored in .shulkers/project.yml */
export interface ProjectConfig {
  name: string;
  description: string;
  serverType: ServerCategory;
  server: ServerConfig;
  /** Installed dependencies (plugins/mods) */
  dependencies?: Record<string, DependencyEntry>;
}

/** Default memory configuration */
const DEFAULT_MEMORY: MemoryConfig = {
  min: "1G",
  max: "2G",
};

/**
 * Get server category from server type.
 * @param type Server type
 * @returns Server category (plugin, mod, or proxy)
 */
export function getServerCategory(type: ServerType): ServerCategory {
  switch (type) {
    case "velocity":
    case "bungeecord":
    case "waterfall":
      return "proxy";
    case "forge":
    case "fabric":
    case "neoforge":
      return "mod";
    case "vanilla":
    case "spigot":
    case "paper":
    case "purpur":
    default:
      return "plugin";
  }
}

/**
 * Read the project configuration file.
 * @returns The parsed project configuration or null if not found
 */
export function readProject(): ProjectConfig | null {
  const filePath = getProjectFilePath();
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    return parse(content) as ProjectConfig;
  } catch (e) {
    console.error("Failed to read project.yml:", e);
    return null;
  }
}

/**
 * Write the project configuration file.
 * @param config The project configuration to save
 */
export function writeProject(config: ProjectConfig): void {
  const shulkersDir = getLocalShulkersDir();
  ensureDir(shulkersDir);

  const filePath = getProjectFilePath();
  try {
    const content = stringify(config, { indent: 2 });
    writeFileSync(filePath, content, "utf-8");
  } catch (e) {
    console.error("Failed to write project.yml:", e);
    throw e;
  }
}

/**
 * Detect server information from docker-compose.yml.
 * @returns Server type and version if detected, null otherwise
 */
export function detectFromDockerCompose(): {
  type: ServerType;
  version: string;
} | null {
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml"];
  for (const file of composeFiles) {
    const filePath = join(process.cwd(), file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const compose = parse(content);

        // Look for itzg/minecraft-server image
        for (const service of Object.values(compose.services || {})) {
          const svc = service as Record<string, unknown>;
          const image = svc.image as string | undefined;
          if (image?.includes("itzg/minecraft-server")) {
            const env = svc.environment as
              | Record<string, string>
              | string[]
              | undefined;
            let serverType: ServerType = "vanilla";
            let version = "latest";

            if (Array.isArray(env)) {
              for (const e of env) {
                const parts = e.split("=");
                if (e.startsWith("TYPE=") && parts[1]) {
                  serverType = parts[1].toLowerCase() as ServerType;
                }
                if (e.startsWith("VERSION=") && parts[1]) {
                  version = parts[1];
                }
              }
            } else if (env) {
              if (env.TYPE) serverType = env.TYPE.toLowerCase() as ServerType;
              if (env.VERSION) version = env.VERSION;
            }

            return { type: serverType, version };
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  return null;
}

/**
 * Detect all JAR files in the current directory.
 * @returns Array of JAR file names
 */
export function detectJarFiles(): string[] {
  const cwd = process.cwd();
  try {
    const files = readdirSync(cwd);
    return files.filter((file) => extname(file).toLowerCase() === ".jar");
  } catch {
    return [];
  }
}

/**
 * Read JAR manifest file to get version information.
 * @param jarPath Path to JAR file
 * @returns Server type and version if detected, null otherwise
 */
async function readJarManifest(
  jarPath: string
): Promise<{ type: ServerType; version: string } | null> {
  try {
    const { readFileSync } = await import("node:fs");
    const JSZip = (await import("jszip")).default;

    const data = readFileSync(jarPath);
    const zip = await JSZip.loadAsync(data);
    const manifestFile = zip.file("META-INF/MANIFEST.MF");

    if (!manifestFile) return null;

    const manifestContent = await manifestFile.async("string");
    const lines = manifestContent.toLowerCase().split("\n");

    let type: ServerType | null = null;
    let version = "";

    // Parse manifest
    for (const line of lines) {
      if (line.includes("implementation-title:")) {
        const title = line.split(":")[1]?.trim() || "";
        if (title.includes("velocity")) type = "velocity";
        else if (title.includes("waterfall")) type = "waterfall";
        else if (title.includes("bungeecord")) type = "bungeecord";
        else if (title.includes("paper")) type = "paper";
        else if (title.includes("purpur")) type = "purpur";
        else if (title.includes("spigot")) type = "spigot";
      }

      if (line.includes("implementation-version:")) {
        const versionStr = line.split(":")[1]?.trim() || "";
        const versionMatch = versionStr.match(/(\d+\.\d+\.\d+)/);
        if (versionMatch?.[1]) {
          version = versionMatch[1];
        }
      }
    }

    if (type && version) {
      return { type, version };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Execute JAR file with --version flag to get server information.
 * Uses spawn for better process control and kills the process after version detection.
 * @param jarPath Path to JAR file
 * @returns Server type and version if detected, null otherwise
 */
export async function getJarVersion(
  jarPath: string
): Promise<{ type: ServerType; version: string } | null> {
  const { spawn } = await import("node:child_process");

  /**
   * Run a command and wait for version detection or timeout.
   */
  const runWithVersionDetection = (
    args: string[]
  ): Promise<{ type: ServerType; version: string } | null> => {
    return new Promise((resolve) => {
      const proc = spawn("java", ["-jar", jarPath, ...args], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let resolved = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      const timeoutMs = 30000; // 30 seconds max

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          // Clear timers
          if (killTimer) clearTimeout(killTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          // Kill the process
          try {
            proc.kill("SIGTERM");
            // Force kill after 1 second if still running
            killTimer = setTimeout(() => {
              try {
                proc.kill("SIGKILL");
              } catch {
                // Process already terminated
              }
            }, 1000);
            killTimer.unref(); // Don't keep event loop alive
          } catch {
            // Process already terminated
          }
        }
      };

      const checkOutput = () => {
        if (resolved) return false;
        const lowerOutput = output.toLowerCase();
        const result = parseServerOutput(lowerOutput);
        if (result) {
          cleanup();
          resolve(result);
          return true;
        }
        return false;
      };

      proc.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
        checkOutput();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        output += data.toString();
        checkOutput();
      });

      proc.on("close", () => {
        if (!resolved) {
          resolved = true;
          if (killTimer) clearTimeout(killTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          // Check one last time after process ends
          const lowerOutput = output.toLowerCase();
          resolve(parseServerOutput(lowerOutput));
        }
      });

      proc.on("error", () => {
        if (!resolved) {
          resolved = true;
          if (killTimer) clearTimeout(killTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          resolve(null);
        }
      });

      // Timeout after 30 seconds
      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          const lowerOutput = output.toLowerCase();
          resolve(parseServerOutput(lowerOutput));
        }
      }, timeoutMs);
      timeoutTimer.unref(); // Don't keep event loop alive
    });
  };

  // Try --version first (works for Paper, Spigot, etc.)
  let result = await runWithVersionDetection(["--version"]);
  if (result) {
    return result;
  }

  // Try without arguments (works for Velocity, Waterfall, etc.)
  result = await runWithVersionDetection([]);
  if (result) {
    return result;
  }

  // Fallback to JAR manifest
  try {
    const manifestInfo = await readJarManifest(jarPath);
    if (manifestInfo) {
      return manifestInfo;
    }
  } catch {
    // Ignore manifest read errors
  }

  return null;
}

/**
 * Parse server output to detect type and version.
 */
function parseServerOutput(
  output: string
): { type: ServerType; version: string } | null {
  let type: ServerType | null = null;
  let version = "";

  // Detect server type from output
  if (output.includes("booting up velocity") || output.includes("velocity")) {
    type = "velocity";
    const velocityMatch = output.match(/velocity\s+(\d+\.\d+\.\d+)/);
    if (velocityMatch?.[1]) {
      version = velocityMatch[1];
    }
  } else if (output.includes("purpur")) {
    type = "purpur";
  } else if (output.includes("paper")) {
    type = "paper";
  } else if (output.includes("spigot")) {
    type = "spigot";
  } else if (output.includes("waterfall")) {
    type = "waterfall";
  } else if (output.includes("bungeecord")) {
    type = "bungeecord";
  } else if (output.includes("forge")) {
    type = "forge";
  } else if (output.includes("fabric")) {
    type = "fabric";
  } else if (output.includes("neoforge")) {
    type = "neoforge";
  } else if (output.includes("minecraft") || output.includes("craftbukkit")) {
    type = "paper";
  }

  // Extract version number if not already found
  if (!version) {
    const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch?.[1]) {
      version = versionMatch[1];
    }
  }

  if (type && version) {
    return { type, version };
  }

  return null;
}

/**
 * Detect server information from JAR files in the current directory.
 * @returns Server type, version, and jar path if detected, null otherwise
 * @deprecated Use detectJarFiles and getJarVersion instead
 */
export function detectFromJar(): {
  type: ServerType;
  version: string;
  jarPath: string;
} | null {
  return null;
}

/**
 * Get the default project configuration.
 * @param name Project name
 * @returns Default project configuration
 */
export function getDefaultProjectConfig(name: string): ProjectConfig {
  const defaultType: ServerType = "paper";
  return {
    name,
    description: "",
    serverType: getServerCategory(defaultType),
    server: {
      type: defaultType,
      version: "1.21",
      memory: DEFAULT_MEMORY,
    },
  };
}

/**
 * Add a dependency to the project.
 * @param name Display name for the dependency
 * @param entry Dependency entry data
 */
export function addDependency(name: string, entry: DependencyEntry): void {
  const config = readProject();
  if (!config) {
    throw new Error("No project.yml found. Run 'sks init' first.");
  }

  if (!config.dependencies) {
    config.dependencies = {};
  }

  config.dependencies[name] = entry;
  writeProject(config);
}

/**
 * Remove a dependency from the project.
 * @param name Dependency name
 * @returns true if removed, false if not found
 */
export function removeDependency(name: string): boolean {
  const config = readProject();
  if (!config || !config.dependencies) {
    return false;
  }

  if (!(name in config.dependencies)) {
    return false;
  }

  delete config.dependencies[name];
  writeProject(config);
  return true;
}

/**
 * Get all dependencies from the project.
 * @returns Record of dependency name to entry, or empty object
 */
export function getDependencies(): Record<string, DependencyEntry> {
  const config = readProject();
  return config?.dependencies || {};
}

/**
 * Get a specific dependency by name.
 * @param name Dependency name
 * @returns Dependency entry or null if not found
 */
export function getDependency(name: string): DependencyEntry | null {
  const config = readProject();
  return config?.dependencies?.[name] || null;
}

/**
 * Update a dependency's version and optional file name.
 * @param name Dependency name
 * @param version New version string
 * @param fileName Optional new file name
 * @returns true if updated, false if not found
 */
export function updateDependencyVersion(
  name: string,
  version: string,
  fileName?: string
): boolean {
  const config = readProject();
  if (!config || !config.dependencies || !(name in config.dependencies)) {
    return false;
  }

  const dep = config.dependencies[name];
  if (!dep) return false;

  dep.version = version;
  if (fileName) {
    dep.fileName = fileName;
  }

  writeProject(config);
  return true;
}
