/**
 * Source resolver for parsing plugin source specifications.
 * Handles formats like "spigot:12345", "modrinth:sodium", "github:owner/repo".
 */

export type SourceType = "spigot" | "modrinth" | "github" | null;

export interface ParsedSource {
  /** Source type (null means search all sources) */
  source: SourceType;
  /** Resource ID (for source:id format) */
  id: string | null;
  /** Search query (for name-only format) */
  query: string | null;
  /** Version specification (from @version suffix) */
  version: string | null;
}

/**
 * Source alias mapping.
 */
const SOURCE_ALIASES: Record<string, SourceType> = {
  spigot: "spigot",
  spiget: "spigot",
  modrinth: "modrinth",
  github: "github",
};

/**
 * Parse a source specification string.
 *
 * Formats:
 * - "query" - Search all sources for "query"
 * - "spigot:12345" - Specific resource from Spigot
 * - "modrinth:sodium" - Specific project from Modrinth
 * - "github:owner/repo" - Specific GitHub repository
 * - "spigot:12345@1.0.0" - Specific version
 *
 * @param input The input string to parse
 * @returns Parsed source information
 */
export function parseSource(input: string): ParsedSource {
  // Check for version suffix
  let version: string | null = null;
  let mainPart = input;

  const atIndex = input.lastIndexOf("@");
  if (atIndex > 0) {
    version = input.slice(atIndex + 1);
    mainPart = input.slice(0, atIndex);
  }

  // Check for source prefix (source:id)
  const colonIndex = mainPart.indexOf(":");
  if (colonIndex > 0) {
    const sourcePrefix = mainPart.slice(0, colonIndex).toLowerCase();
    const source = SOURCE_ALIASES[sourcePrefix];

    if (source) {
      const id = mainPart.slice(colonIndex + 1);
      return {
        source,
        id,
        query: null,
        version,
      };
    }
  }

  // No valid source prefix, treat as search query
  return {
    source: null,
    id: null,
    query: mainPart,
    version,
  };
}

/**
 * Get the internal source ID for a given source type.
 * Maps display names back to repository IDs.
 *
 * @param source Source type
 * @returns Repository ID
 */
export function getRepositoryId(source: SourceType): string {
  switch (source) {
    case "spigot":
      return "spiget";
    case "modrinth":
      return "modrinth";
    case "github":
      return "github";
    default:
      return "";
  }
}

/**
 * Format a source:id string for display.
 *
 * @param source Source type
 * @param id Resource ID
 * @returns Formatted string like "spigot:12345"
 */
export function formatSourceId(source: SourceType, id: string): string {
  if (!source) {
    return id;
  }
  return `${source}:${id}`;
}
