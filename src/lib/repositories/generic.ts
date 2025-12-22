import ky from "ky";
import type {
  Repository,
  SearchResult,
  DetailedResource,
  VersionEntry,
  VersionInfo,
} from "./types";

/**
 * Configuration for a generic repository.
 */
export interface GenericRepositoryConfig {
  id: string;
  name: string;
  baseUrl: string;
  /** Search endpoint path, use {{query}} as placeholder */
  searchPath: string;
  /** Path to get latest version, use {{id}} as placeholder */
  versionPath: string;
  /** Optional download endpoint path, use {{id}}, {{version}}, {{fileName}} as placeholders */
  downloadPath?: string;
  /** JSON path mappings for search results */
  mappings: {
    /** JSON path to the array of results (empty string if root is array) */
    resultsPath: string;
    id: string;
    name: string;
    description: string;
    author: string;
  };
  /** JSON path mappings for version info */
  versionMappings: {
    version: string;
    downloadUrl: string;
    fileName?: string;
  };
}

/**
 * Generic repository implementation that works with configurable JSON APIs.
 */
export class GenericRepository implements Repository {
  public readonly id: string;
  public readonly name: string;
  public readonly baseUrl: string;
  public readonly assetTypes: ("mod" | "plugin")[] = ["plugin"];

  private readonly api: typeof ky;

  constructor(private readonly config: GenericRepositoryConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.api = ky.create({ prefixUrl: this.baseUrl });
  }

  /**
   * Safely convert an unknown value to a string.
   * Returns empty string for objects/arrays to avoid [object Object].
   */
  private toSafeString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    // For objects, arrays, etc., return empty string to avoid [object Object]
    return "";
  }

  /**
   * Resolve a value from a JSON object using a dot-notation path.
   */
  private resolvePath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    return path.split(".").reduce((o, i) => {
      if (o && typeof o === "object" && i in o) {
        return (o as Record<string, unknown>)[i];
      }
      return undefined;
    }, obj);
  }

  /**
   * Search for items using the generic config.
   */
  public async search(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { loaders?: string[] }
  ): Promise<SearchResult[]> {
    const path = this.config.searchPath.replace(
      "{{query}}",
      encodeURIComponent(query)
    );
    const response = await this.api.get(path).json<unknown>();

    const results = this.resolvePath(
      response,
      this.config.mappings.resultsPath
    );
    if (!Array.isArray(results)) return [];

    return results.map((item) => {
      const itemId = this.toSafeString(
        this.resolvePath(item, this.config.mappings.id)
      );
      return {
        id: itemId || "",
        name:
          this.toSafeString(
            this.resolvePath(item, this.config.mappings.name)
          ) || "Unknown",
        description: this.toSafeString(
          this.resolvePath(item, this.config.mappings.description)
        ),
        author:
          this.toSafeString(
            this.resolvePath(item, this.config.mappings.author)
          ) || "Unknown",
        version: "latest",
        downloads: 0,
        source: this.id,
        url: `${this.baseUrl}/${itemId}`,
        types: ["plugin"] as const,
      };
    });
  }

  /**
   * Get detailed resource information.
   * Generic implementation returns minimal info.
   */
  public async getResource(id: string): Promise<DetailedResource> {
    const versionInfo = await this.getLatestVersion(id);
    return {
      id,
      name: id,
      description: "",
      author: "Unknown",
      version: versionInfo.version,
      downloads: 0,
      source: this.id,
      url: `${this.baseUrl}/${id}`,
      testedVersions: [],
      external: false,
      premium: false,
      types: ["plugin"] as const,
    };
  }

  /**
   * Get list of versions.
   * Generic implementation only returns latest.
   */
  public async getVersions(id: string): Promise<VersionEntry[]> {
    const versionInfo = await this.getLatestVersion(id);
    return [
      {
        id: versionInfo.version,
        name: versionInfo.version,
        releaseDate: Date.now() / 1000,
        downloads: 0,
      },
    ];
  }

  /**
   * Get version info using the generic config.
   * @param id Resource ID
   * @param _loaders Ignored for Generic
   */
  public async getLatestVersion(
    id: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const path = this.config.versionPath.replace("{{id}}", id);
    const response = await this.api.get(path).json<unknown>();

    const version = this.toSafeString(
      this.resolvePath(response, this.config.versionMappings.version)
    );
    const fileName = this.config.versionMappings.fileName
      ? String(this.resolvePath(response, this.config.versionMappings.fileName))
      : `${id}-${version}.jar`;

    const downloadUrl = this.config.versionMappings.downloadUrl
      ? String(
          this.resolvePath(response, this.config.versionMappings.downloadUrl)
        )
      : "";

    return {
      id: id,
      version: version,
      downloadUrl: downloadUrl,
      fileName: fileName,
    };
  }

  /**
   * Get specific version download info.
   * Generic implementation just returns latest.
   */
  public async getVersionDownload(
    id: string,
    _version: string
  ): Promise<VersionInfo> {
    return this.getLatestVersion(id);
  }
}
