/**
 * Get compatible loaders for a given server type.
 * Used to filter Modrinth versions.
 * @param serverType "paper", "fabric", "velocity", etc.
 */
export function getCompatibleLoaders(serverType: string): string[] {
  const type = serverType.toLowerCase();

  const mapping: Record<string, string[]> = {
    // Plugin servers
    paper: ["paper", "purpur", "folia", "spigot", "bukkit"],
    purpur: ["purpur", "paper", "spigot", "bukkit"],
    folia: ["folia", "paper", "spigot", "bukkit"],
    spigot: ["spigot", "bukkit"],
    bukkit: ["bukkit"],

    // Proxy
    bungeecord: ["bungeecord", "waterfall"],
    waterfall: ["waterfall", "bungeecord"],
    velocity: ["velocity"],

    // Mod servers
    fabric: ["fabric", "quilt"],
    quilt: ["quilt", "fabric"],
    forge: ["forge"],
    neoforge: ["neoforge", "forge"],
  };

  // Return mapped loaders or the type itself if not found
  return mapping[type] || [type];
}
