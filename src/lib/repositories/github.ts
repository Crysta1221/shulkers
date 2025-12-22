import ky from "ky";
import type {
  Repository,
  SearchResult,
  DetailedResource,
  VersionEntry,
  VersionInfo,
} from "./types";

/**
 * GitHub repository entry configuration.
 */
export interface GitHubRepoEntry {
  /** GitHub repository URL (e.g., https://github.com/owner/repo) */
  url: string;
  /** Display name for this repository */
  name: string;
}

/**
 * GitHub repositories configuration file structure.
 */
export interface GitHubRepositoriesConfig {
  /** List of GitHub repositories */
  repositories: GitHubRepoEntry[];
}

/**
 * GitHub API response types.
 */
interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  published_at: string;
  assets: GitHubAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  download_count: number;
  size: number;
}

interface GitHubRepoInfo {
  description: string | null;
  stargazers_count: number;
}

/**
 * GitHub repository implementation that fetches releases from GitHub API.
 */
export class GitHubRepository implements Repository {
  public readonly id = "github";
  public readonly name = "GitHub Releases";
  public readonly baseUrl = "https://api.github.com";
  public readonly assetTypes: ("mod" | "plugin")[] = ["plugin"];

  private readonly api: typeof ky;
  private repositories: Map<string, GitHubRepoEntry> = new Map();

  constructor(repos: GitHubRepoEntry[] = []) {
    this.api = ky.create({
      prefixUrl: this.baseUrl,
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "shulkers-cli/1.0.0",
      },
    });
    this.loadRepositories(repos);
  }

  /**
   * Load GitHub repositories from configuration.
   */
  public loadRepositories(repos: GitHubRepoEntry[]): void {
    this.repositories.clear();
    for (const repo of repos) {
      const { owner, repoName } = this.parseGitHubUrl(repo.url);
      const id = `${owner}/${repoName}`;
      this.repositories.set(id, repo);
    }
  }

  /**
   * Parse GitHub URL to extract owner and repository name.
   */
  private parseGitHubUrl(url: string): { owner: string; repoName: string } {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return {
      owner: match[1],
      repoName: match[2].replace(/\.git$/, ""),
    };
  }

  /**
   * Search for plugins/mods in registered GitHub repositories.
   */
  public async search(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { loaders?: string[] }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [id, repo] of this.repositories.entries()) {
      if (
        repo.name.toLowerCase().includes(lowerQuery) ||
        id.toLowerCase().includes(lowerQuery)
      ) {
        const { owner, repoName } = this.parseGitHubUrl(repo.url);

        try {
          const repoInfo = await this.api
            .get(`repos/${owner}/${repoName}`)
            .json<GitHubRepoInfo>();

          results.push({
            id: id,
            name: repo.name,
            description: repoInfo.description || "",
            author: owner,
            version: "latest",
            downloads: 0,
            source: "github",
            url: repo.url,
            types: ["plugin"] as const,
          });
        } catch {
          // Skip if repository is not accessible
        }
      }
    }

    return results;
  }

  /**
   * Get detailed resource information.
   */
  public async getResource(id: string): Promise<DetailedResource> {
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`GitHub repository not found: ${id}`);
    }

    const { owner, repoName } = this.parseGitHubUrl(repo.url);

    const repoInfo = await this.api
      .get(`repos/${owner}/${repoName}`)
      .json<GitHubRepoInfo>();

    return {
      id: id,
      name: repo.name,
      description: repoInfo.description || "",
      author: owner,
      version: "latest",
      downloads: 0,
      source: "github",
      url: repo.url,
      testedVersions: [],
      external: false,
      premium: false,
      types: ["plugin"] as const,
    };
  }

  /**
   * Get list of releases for a GitHub repository.
   */
  public async getVersions(id: string): Promise<VersionEntry[]> {
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`GitHub repository not found: ${id}`);
    }

    const { owner, repoName } = this.parseGitHubUrl(repo.url);

    const releases = await this.api
      .get(`repos/${owner}/${repoName}/releases`, {
        searchParams: { per_page: 20 },
      })
      .json<GitHubRelease[]>();

    return releases.map((r) => ({
      id: r.tag_name,
      name: r.tag_name.replace(/^v/, ""),
      releaseDate: new Date(r.published_at).getTime() / 1000,
      downloads: r.assets.reduce((sum, a) => sum + a.download_count, 0),
    }));
  }

  /**
   * Get the latest release version info for a GitHub repository.
   * @param id GitHub repo ID
   * @param _loaders Ignored for GitHub
   */
  public async getLatestVersion(
    id: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`GitHub repository not found: ${id}`);
    }

    const { owner, repoName } = this.parseGitHubUrl(repo.url);

    const release = await this.api
      .get(`repos/${owner}/${repoName}/releases/latest`)
      .json<GitHubRelease>();

    const asset = release.assets.find((a) => a.name.endsWith(".jar"));
    if (!asset) {
      throw new Error(`No jar asset found in latest release for ${id}`);
    }

    return {
      id: id,
      version: release.tag_name,
      downloadUrl: asset.browser_download_url,
      fileName: asset.name,
    };
  }

  /**
   * Get specific version download info.
   * @param id GitHub repo ID
   * @param version Tag name
   * @param _loaders Ignored for GitHub
   */
  public async getVersionDownload(
    id: string,
    version: string,
    _loaders?: string[]
  ): Promise<VersionInfo> {
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`GitHub repository not found: ${id}`);
    }

    const { owner, repoName } = this.parseGitHubUrl(repo.url);

    // Find release by tag
    // Try exact, with v, without v
    let release: GitHubRelease;
    try {
      release = await this.api
        .get(`repos/${owner}/${repoName}/releases/tags/${version}`)
        .json<GitHubRelease>();
    } catch {
      try {
        const withV = version.startsWith("v") ? version : `v${version}`;
        release = await this.api
          .get(`repos/${owner}/${repoName}/releases/tags/${withV}`)
          .json<GitHubRelease>();
      } catch {
        const noV = version.replace(/^v/, "");
        release = await this.api
          .get(`repos/${owner}/${repoName}/releases/tags/${noV}`)
          .json<GitHubRelease>();
      }
    }

    const asset = release.assets.find((a) => a.name.endsWith(".jar"));
    if (!asset) {
      throw new Error(`No jar asset found in release ${version} for ${id}`);
    }

    return {
      id: id,
      version: release.tag_name,
      downloadUrl: asset.browser_download_url,
      fileName: asset.name,
    };
  }
}
