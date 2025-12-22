/**
 * Common interface for search results across different repositories.
 */
export interface SearchResult {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  source: string;
  url: string;
  /** Types of resource: 'mod' and/or 'plugin' */
  types: ("mod" | "plugin")[];
}

/**
 * Detailed resource information including compatibility data.
 */
export interface DetailedResource extends SearchResult {
  /** List of tested/supported Minecraft versions */
  testedVersions: string[];
  /** Whether the resource is external (not directly downloadable) */
  external: boolean;
  /** Whether the resource is a premium (paid) resource */
  premium: boolean;
}

/**
 * Entry in a version list.
 */
export interface VersionEntry {
  /** Version ID (internal) */
  id: string;
  /** Version name (e.g., "1.0.0") */
  name: string;
  /** Release date timestamp */
  releaseDate: number;
  /** Number of downloads for this version */
  downloads: number;
  /** Supported game versions for this release */
  gameVersions?: string[];
}

/**
 * Information about a specific version of a plugin/mod.
 */
export interface VersionInfo {
  id: string;
  version: string;
  downloadUrl: string;
  fileName: string;
}

/**
 * Base repository interface.
 */
export interface Repository {
  /** Unique identifier for the repository */
  id: string;
  /** Human-readable name */
  name: string;
  /** The base URL of the API */
  baseUrl: string;
  /** Types of assets this repository provides: 'mod', 'plugin', or both */
  assetTypes: ("mod" | "plugin")[];

  /**
   * Search for plugins/mods
   * @param query Search query
   * @param options Search options (e.g. loaders filter)
   */
  search(
    query: string,
    options?: { loaders?: string[] }
  ): Promise<SearchResult[]>;

  /**
   * Get detailed resource information. */
  getResource(id: string): Promise<DetailedResource>;

  /** Get list of versions for a resource */
  getVersions(id: string): Promise<VersionEntry[]>;

  /**
   * Get the latest version info.
   * @param id Project ID or slug
   * @param loaders Optional list of compatible loaders (e.g. ["paper", "spigot"]) to filter files
   */
  getLatestVersion(id: string, loaders?: string[]): Promise<VersionInfo>;

  /**
   * Get specific version download info.
   * @param id Project ID or slug
   * @param version Version number or ID
   * @param loaders Optional list of compatible loaders to filter files
   */
  getVersionDownload(
    id: string,
    version: string,
    loaders?: string[]
  ): Promise<VersionInfo>;
}
