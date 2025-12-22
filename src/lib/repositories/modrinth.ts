import ky from "ky";
import type {
  Repository,
  SearchResult,
  DetailedResource,
  VersionEntry,
  VersionInfo,
} from "./types";

/**
 * Modrinth API response types.
 */
interface ModrinthSearchResult {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  latest_version: string;
  versions: string[];
  project_type: "mod" | "plugin" | "modpack" | "resourcepack" | "shader";
  categories?: string[];
}

// Plugin server loaders (Bukkit-based)
const PLUGIN_LOADERS = new Set([
  "bukkit",
  "spigot",
  "paper",
  "purpur",
  "folia",
  "bungeecord",
  "waterfall",
  "velocity",
]);

// Mod loaders
const MOD_LOADERS = new Set([
  "fabric",
  "forge",
  "neoforge",
  "quilt",
  "liteloader",
  "rift",
]);

/**
 * Determine asset types from loaders/categories.
 * Returns both 'mod' and 'plugin' if the project supports both.
 */
function getAssetTypesFromLoaders(loaders: string[]): ("mod" | "plugin")[] {
  const types: ("mod" | "plugin")[] = [];

  const hasModLoader = loaders.some((l) => MOD_LOADERS.has(l.toLowerCase()));
  const hasPluginLoader = loaders.some((l) =>
    PLUGIN_LOADERS.has(l.toLowerCase())
  );

  if (hasModLoader) types.push("mod");
  if (hasPluginLoader) types.push("plugin");

  // Fallback: if no recognized loader, assume mod
  if (types.length === 0) types.push("mod");

  return types;
}
interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
  followers: number;
  game_versions: string[];
  loaders: string[];
  versions: string[];
  project_type: "mod" | "plugin" | "modpack" | "resourcepack" | "shader";
}

interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  date_published: string;
  downloads: number;
  game_versions: string[];
  loaders: string[];
  files: ModrinthFile[];
}

interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

/**
 * Modrinth repository implementation.
 */
export class ModrinthRepository implements Repository {
  public readonly id = "modrinth";
  public readonly name = "Modrinth";
  public readonly baseUrl = "https://api.modrinth.com/v2";
  public readonly assetTypes: ("mod" | "plugin")[] = ["mod", "plugin"];

  private readonly api = ky.create({
    prefixUrl: this.baseUrl,
    headers: {
      "User-Agent": "shulkers-cli/1.0.0 (https://github.com/shulkers)",
    },
  });

  /**
   * Search for projects on Modrinth.
   * @param query Search keywords
   */
  public async search(
    query: string,
    options?: { loaders?: string[] }
  ): Promise<SearchResult[]> {
    const searchParams: Record<string, string | number> = {
      query,
      limit: 20,
      index: "relevance",
    };

    // Add loader filtering if provided
    if (options?.loaders && options.loaders.length > 0) {
      const facets: string[][] = [];
      const loaderFacets: string[] = [];

      let hasPluginLoader = false;
      let hasModLoader = false;

      for (const loader of options.loaders) {
        if (PLUGIN_LOADERS.has(loader)) {
          hasPluginLoader = true;
          // Map common plugin loaders to modrinth categories
          if (loader === "spigot") {
            loaderFacets.push("categories:bukkit"); // Spigot projects usually tagged bukkit
            loaderFacets.push("categories:paper"); // Or paper
          } else {
            loaderFacets.push(`categories:${loader}`);
          }
        } else if (MOD_LOADERS.has(loader)) {
          hasModLoader = true;
          loaderFacets.push(`categories:${loader}`);
        }
      }

      // Add "bukkit" category fallback if any plugin loader is present, as it's the base
      if (hasPluginLoader && !loaderFacets.includes("categories:bukkit")) {
        loaderFacets.push("categories:bukkit");
      }

      // Filter uniques
      const uniqueLoaderFacets = [...new Set(loaderFacets)];

      if (uniqueLoaderFacets.length > 0) {
        facets.push(uniqueLoaderFacets);
      }

      // Add project_type filter to strictly separate mods and plugins
      if (hasPluginLoader && !hasModLoader) {
        facets.push(["project_type:plugin"]);
      } else if (hasModLoader && !hasPluginLoader) {
        facets.push(["project_type:mod"]);
      }

      if (facets.length > 0) {
        searchParams.facets = JSON.stringify(facets);
      }
    }

    const response = await this.api
      .get("search", {
        searchParams,
      })
      .json<{ hits: ModrinthSearchResult[] }>();

    // Fetch actual latest version for each project (in parallel)
    const projectIds = response.hits.map((res) => res.project_id);
    const versionMap = new Map<string, string>();

    // Batch fetch: get versions for each project and find the actual latest
    await Promise.all(
      projectIds.slice(0, 10).map(async (projectId) => {
        try {
          // Note: Do NOT use limit=1 here. Modrinth API sometimes returns old featured versions
          // when limit is used (e.g. CommandAPI returning v8 instead of v11).
          // We must fetch versions and sort manually.
          const versions = await this.api
            .get(`project/${projectId}/version`)
            .json<ModrinthVersion[]>();

          if (versions.length > 0) {
            // Filter by loaders if provided to show the latest COMPATIBLE version
            let compatibleVersions = versions;
            if (options?.loaders && options.loaders.length > 0) {
              const userLoaders = new Set(
                options.loaders.map((l) => l.toLowerCase())
              );
              const filtered = versions.filter((v) =>
                v.loaders.some((l) => userLoaders.has(l.toLowerCase()))
              );
              // If we have compatible versions, use them. Otherwise fallback to all (e.g. if metadata is missing)
              if (filtered.length > 0) {
                compatibleVersions = filtered;
              }
            }

            // Sort by date published descending
            compatibleVersions.sort((a, b) => {
              return (
                new Date(b.date_published).getTime() -
                new Date(a.date_published).getTime()
              );
            });
            const latest = compatibleVersions[0];
            if (latest) {
              versionMap.set(projectId, latest.version_number);
            }
          }
        } catch {
          // Ignore errors
        }
      })
    );

    return response.hits.map((res) => ({
      id: res.project_id,
      name: res.title,
      description: res.description,
      author: res.author,
      version: versionMap.get(res.project_id) || "latest",
      downloads: res.downloads,
      source: "modrinth",
      url: `https://modrinth.com/project/${res.slug}`,
      // Use categories to determine types (categories include loaders like bukkit, paper, fabric)
      types: getAssetTypesFromLoaders(res.categories || []),
    }));
  }

  /**
   * Get detailed resource information.
   * @param id Project ID or slug
   */
  public async getResource(id: string): Promise<DetailedResource> {
    const project = await this.api.get(`project/${id}`).json<ModrinthProject>();

    // Get team members to find author
    let author = "Unknown";
    try {
      const team = await this.api
        .get(`project/${id}/members`)
        .json<{ user: { username: string }; role: string }[]>();
      const owner = team.find((m) => m.role === "Owner");
      if (owner) {
        author = owner.user.username;
      }
    } catch {
      // Ignore error, use default author
    }

    return {
      id: project.id,
      name: project.title,
      description: project.description,
      author,
      version: "latest",
      downloads: project.downloads,
      source: "modrinth",
      url: `https://modrinth.com/project/${project.slug}`,
      testedVersions: project.game_versions || [],
      external: false,
      premium: false,
      // Use loaders to determine types
      types: getAssetTypesFromLoaders(project.loaders),
    };
  }

  /**
   * Get list of versions for a project.
   * @param id Project ID or slug
   */
  public async getVersions(id: string): Promise<VersionEntry[]> {
    const versions = await this.api
      .get(`project/${id}/version`)
      .json<ModrinthVersion[]>();

    return versions.map((v) => ({
      id: v.id,
      name: v.version_number,
      releaseDate: new Date(v.date_published).getTime() / 1000,
      downloads: v.downloads,
      gameVersions: v.game_versions,
    }));
  }

  /**
   * Get the latest version info.
   * @param id Project ID or slug
   * @param loaders Optional list of compatible loaders to filter versions
   */
  public async getLatestVersion(
    id: string,
    loaders?: string[]
  ): Promise<VersionInfo> {
    const versions = await this.api
      .get(`project/${id}/version`)
      .json<ModrinthVersion[]>();

    let compatibleVersions = versions;

    // Filter by loaders if specified
    if (loaders && loaders.length > 0) {
      const filtered = versions.filter((v) =>
        v.loaders.some((l) => loaders.includes(l.toLowerCase()))
      );
      if (filtered.length > 0) {
        compatibleVersions = filtered;
      }
      // If filtered result is empty, fallback to all versions (with potential mismatch)
    }

    const latest = compatibleVersions[0];
    if (!latest) {
      throw new Error(`No versions found for project ${id}`);
    }

    const primaryFile = latest.files.find((f) => f.primary) || latest.files[0];

    if (!primaryFile) {
      throw new Error(`No files found for version ${latest.version_number}`);
    }

    return {
      id: id,
      version: latest.version_number,
      downloadUrl: primaryFile.url,
      fileName: primaryFile.filename,
    };
  }

  /**
   * Get specific version download info.
   * @param id Project ID or slug
   * @param version Version number or ID
   * @param _loaders Ignored for specific version download
   */
  public async getVersionDownload(
    id: string,
    version: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const versions = await this.api
      .get(`project/${id}/version`)
      .json<ModrinthVersion[]>();

    const targetVersion = versions.find(
      (v) => v.version_number === version || v.id === version
    );

    if (!targetVersion) {
      throw new Error(`Version ${version} not found for project ${id}`);
    }

    const primaryFile =
      targetVersion.files.find((f) => f.primary) || targetVersion.files[0];

    if (!primaryFile) {
      throw new Error(`No files found for version ${version}`);
    }

    return {
      id: id,
      version: targetVersion.version_number,
      downloadUrl: primaryFile.url,
      fileName: primaryFile.filename,
    };
  }
}
