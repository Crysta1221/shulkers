import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * Plugin/Mod metadata extracted from JAR file.
 */
export interface PluginMetadata {
  /** Plugin/Mod name */
  name: string;
  /** Version string */
  version: string;
  /** Main class (if available) */
  mainClass?: string;
  /** Author (if available) */
  author?: string;
  /** Plugin type detected */
  type: "bukkit" | "bungee" | "velocity" | "fabric" | "forge" | "unknown";
}

/**
 * Bukkit plugin.yml structure.
 */
interface BukkitPluginYml {
  name?: string;
  version?: string;
  main?: string;
  author?: string;
  authors?: string[];
}

/**
 * BungeeCord bungee.yml structure.
 */
interface BungeePluginYml {
  name?: string;
  version?: string;
  main?: string;
  author?: string;
}

/**
 * Velocity velocity-plugin.json structure.
 */
interface VelocityPluginJson {
  id?: string;
  name?: string;
  version?: string;
  main?: string;
  authors?: string[];
}

/**
 * Fabric fabric.mod.json structure.
 */
interface FabricModJson {
  id?: string;
  name?: string;
  version?: string;
  authors?: (string | { name: string })[];
  entrypoints?: Record<string, string[]>;
}

/**
 * Analyze a JAR file and extract plugin/mod metadata.
 *
 * @param jarPath Path to the JAR file
 * @returns Plugin metadata or null if not a valid plugin/mod
 */
export async function analyzeJar(
  jarPath: string
): Promise<PluginMetadata | null> {
  try {
    const data = readFileSync(jarPath);
    const zip = await JSZip.loadAsync(data);

    // Try different plugin/mod descriptors in order of priority

    // 1. Bukkit/Spigot/Paper plugin.yml
    const pluginYml = zip.file("plugin.yml");
    if (pluginYml) {
      const content = await pluginYml.async("string");
      const parsed = parseYaml(content) as BukkitPluginYml;
      if (parsed.name) {
        return {
          name: parsed.name,
          version: String(parsed.version || "unknown"),
          mainClass: parsed.main,
          author: parsed.author || parsed.authors?.[0],
          type: "bukkit",
        };
      }
    }

    // 2. BungeeCord bungee.yml
    const bungeeYml = zip.file("bungee.yml");
    if (bungeeYml) {
      const content = await bungeeYml.async("string");
      const parsed = parseYaml(content) as BungeePluginYml;
      if (parsed.name) {
        return {
          name: parsed.name,
          version: String(parsed.version || "unknown"),
          mainClass: parsed.main,
          author: parsed.author,
          type: "bungee",
        };
      }
    }

    // 3. Velocity velocity-plugin.json
    const velocityJson = zip.file("velocity-plugin.json");
    if (velocityJson) {
      const content = await velocityJson.async("string");
      const parsed = JSON.parse(content) as VelocityPluginJson;
      if (parsed.id || parsed.name) {
        return {
          name: parsed.name || parsed.id || "unknown",
          version: String(parsed.version || "unknown"),
          mainClass: parsed.main,
          author: parsed.authors?.[0],
          type: "velocity",
        };
      }
    }

    // 4. Fabric fabric.mod.json
    const fabricJson = zip.file("fabric.mod.json");
    if (fabricJson) {
      const content = await fabricJson.async("string");
      const parsed = JSON.parse(content) as FabricModJson;
      if (parsed.id || parsed.name) {
        const author = parsed.authors?.[0];
        return {
          name: parsed.name || parsed.id || "unknown",
          version: String(parsed.version || "unknown"),
          author: typeof author === "string" ? author : author?.name,
          type: "fabric",
        };
      }
    }

    // 5. Check for Forge mods.toml (NeoForge/Forge)
    const modsToml = zip.file("META-INF/mods.toml");
    if (modsToml) {
      const content = await modsToml.async("string");
      // Simple parsing for mods.toml
      const nameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      if (nameMatch?.[1]) {
        return {
          name: nameMatch[1],
          version: versionMatch?.[1] || "unknown",
          type: "forge",
        };
      }
    }

    // Could not identify plugin/mod type
    return null;
  } catch {
    // Failed to read or parse JAR
    return null;
  }
}

/**
 * Extract plugin name from JAR filename as fallback.
 *
 * @param fileName JAR file name
 * @returns Extracted name and version
 */
export function parseJarFileName(fileName: string): {
  name: string;
  version: string | null;
} {
  // Remove .jar extension
  const baseName = fileName.replace(/\.jar$/i, "");

  // Common patterns:
  // PluginName-1.0.0.jar
  // PluginName-v1.0.0.jar
  // PluginName_1.0.0.jar
  // PluginName 1.0.0.jar

  const patterns = [
    /^(.+?)[-_\s]v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)$/,
    /^(.+?)[-_\s](\d+\.\d+(?:\.\d+)?)$/,
  ];

  for (const pattern of patterns) {
    const match = baseName.match(pattern);
    if (match?.[1] && match[2]) {
      return {
        name: match[1].replace(/[-_]/g, " ").trim(),
        version: match[2],
      };
    }
  }

  // No version pattern found
  return {
    name: baseName,
    version: null,
  };
}
