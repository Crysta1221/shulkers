import type { Repository, SearchResult } from "./types";
import { SpigetRepository } from "./spiget";
import { ModrinthRepository } from "./modrinth";
import { GenericRepository, type GenericRepositoryConfig } from "./generic";

/**
 * Manager for handling multiple plugin/mod repositories.
 */
export class RepositoryManager {
  private repositories: Map<string, Repository> = new Map();

  constructor() {
    // Register built-in repositories
    this.addRepository(new SpigetRepository());
    this.addRepository(new ModrinthRepository());
  }

  /**
   * Add a repository instance to the manager.
   * @param repository Repository instance
   */
  public addRepository(repository: Repository): void {
    this.repositories.set(repository.id, repository);
  }

  /**
   * Add a generic repository from configuration.
   * @param config Generic repository configuration
   */
  public addGenericRepository(config: GenericRepositoryConfig): void {
    this.addRepository(new GenericRepository(config));
  }

  /**
   * Load multiple generic repositories from configurations.
   * @param configs Array of generic repository configurations
   */
  public loadFromConfig(configs: GenericRepositoryConfig[]): void {
    for (const config of configs) {
      this.addGenericRepository(config);
    }
  }

  /**
   * Get all registered repositories.
   */
  public getAll(): Repository[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Get a repository by ID.
   * @param id Repository ID
   */
  public get(id: string): Repository | undefined {
    return this.repositories.get(id);
  }

  /**
   * Search across all repositories.
   * @param query Search keywords
   */
  public async searchAll(query: string): Promise<SearchResult[]> {
    const allResults = await Promise.all(
      this.getAll().map((repo) =>
        repo.search(query).catch((err) => {
          console.error(`Error searching ${repo.name}:`, err);
          return [] as SearchResult[];
        })
      )
    );
    return allResults.flat();
  }
}

// Export a singleton instance
export const repositoryManager = new RepositoryManager();
