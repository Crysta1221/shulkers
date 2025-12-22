import ky from "ky";
import type {
  Repository,
  SearchResult,
  DetailedResource,
  VersionEntry,
  VersionInfo,
} from "./types";

/**
 * Spiget API response types.
 */
interface SpigetResource {
  id: number;
  name: string;
  tag: string;
  contributors?: string;
  downloads: number;
  external: boolean;
  premium?: boolean;
  testedVersions: string[];
  version: { id: number };
  author: { id: number };
  file?: {
    type: string;
    size: number;
    sizeUnit: string;
    url: string;
    externalUrl?: string;
  };
}

interface SpigetVersion {
  id: number;
  uuid?: string;
  name: string;
  releaseDate: number;
  downloads: number;
}

/**
 * Spiget (SpigotMC) repository implementation.
 */
export class SpigetRepository implements Repository {
  public readonly id = "spiget";
  public readonly name = "Spiget (SpigotMC)";
  public readonly baseUrl = "https://api.spiget.org/v2";
  public readonly assetTypes: ("mod" | "plugin")[] = ["plugin"];

  private readonly api = ky.create({ prefixUrl: this.baseUrl });

  /**
   * Search for plugins on Spiget.
   * @param query Search keywords
   */
  public async search(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { loaders?: string[] }
  ): Promise<SearchResult[]> {
    let results: SpigetResource[] = [];
    try {
      results = await this.api
        .get(`search/resources/${encodeURIComponent(query)}`, {
          searchParams: {
            size: 20,
            fields:
              "id,name,tag,author,version,downloads,testedVersions,external,premium",
          },
        })
        .json<SpigetResource[]>();
    } catch {
      // Spiget returns 404 if no results found or on API error
      return [];
    }

    // Fetch actual latest version for each resource (in parallel)
    const versionMap = new Map<number, string>();
    await Promise.all(
      results.slice(0, 10).map(async (res) => {
        try {
          const latestVersion = await this.api
            .get(`resources/${res.id}/versions/latest`)
            .json<SpigetVersion>();
          versionMap.set(res.id, latestVersion.name);
        } catch {
          // Ignore errors
        }
      })
    );

    return results.map((res) => ({
      id: res.id.toString(),
      name: res.name,
      description: res.tag || "",
      author: res.author.id.toString(),
      version: versionMap.get(res.id) || "latest",
      downloads: res.downloads,
      source: "spigot",
      url: `https://www.spigotmc.org/resources/${res.id}`,
      types: ["plugin"] as const, // SpigotMC only hosts plugins
    }));
  }

  /**
   * Get detailed resource information.
   * @param id Resource ID
   */
  public async getResource(id: string): Promise<DetailedResource> {
    const res = await this.api.get(`resources/${id}`).json<SpigetResource>();

    return {
      id: res.id.toString(),
      name: res.name,
      description: res.tag || "",
      author: res.author.id.toString(),
      version: res.version?.id?.toString() || "unknown",
      downloads: res.downloads,
      source: "spigot",
      url: `https://www.spigotmc.org/resources/${res.id}`,
      testedVersions: res.testedVersions || [],
      external: res.external || false,
      premium: res.premium || false,
      types: ["plugin"] as const,
    };
  }

  /**
   * Get list of versions for a resource.
   * @param id Resource ID
   */
  public async getVersions(id: string): Promise<VersionEntry[]> {
    const versions = await this.api
      .get(`resources/${id}/versions`, {
        searchParams: { size: 20 },
      })
      .json<SpigetVersion[]>();

    return versions.map((v) => ({
      id: v.id.toString(),
      name: v.name,
      releaseDate: v.releaseDate,
      downloads: v.downloads,
    }));
  }

  /**
   * Get the latest version info.
   * @param id Resource ID
   * @param _loaders Ignored for Spiget
   */
  public async getLatestVersion(
    id: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const resource = await this.api
      .get(`resources/${id}`)
      .json<SpigetResource>();
    const latestVersion = await this.api
      .get(`resources/${id}/versions/latest`)
      .json<SpigetVersion>();

    const fileName = this.sanitizeFileName(resource.name) + ".jar";

    return {
      id: id,
      version: latestVersion.name,
      downloadUrl: `${this.baseUrl}/resources/${id}/download`,
      fileName,
    };
  }

  /**
   * Get specific version download info.
   * @param id Resource ID
   * @param version Version ID on Spiget
   * @param _loaders Ignored for Spiget
   */
  public async getVersionDownload(
    id: string,
    version: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const resource = await this.api
      .get(`resources/${id}`)
      .json<SpigetResource>();

    // Find version by name or ID
    const versions = await this.getVersions(id);
    const targetVersion = versions.find(
      (v) => v.name === version || v.id === version
    );

    if (!targetVersion) {
      throw new Error(`Version ${version} not found for resource ${id}`);
    }

    const fileName = this.sanitizeFileName(resource.name) + ".jar";

    return {
      id: id,
      version: targetVersion.name,
      downloadUrl: `${this.baseUrl}/resources/${id}/versions/${targetVersion.id}/download`,
      fileName,
    };
  }

  /**
   * Sanitize file name by replacing spaces and invalid characters.
   */
  private sanitizeFileName(name: string): string {
    return name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
  }
}
