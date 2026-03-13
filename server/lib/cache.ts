import NodeCache from 'node-cache';

// ---------------------------------------------------------------------------
// CacheManager — thin wrapper around node-cache
// ---------------------------------------------------------------------------

export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  ksize: number;
  vsize: number;
}

class CacheManager {
  private cache: NodeCache;
  private maxKeys: number;
  private ttlSeconds: number;

  constructor(ttlSeconds = 300, maxKeys = 5000) {
    this.ttlSeconds = ttlSeconds;
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      useClones: false,
    });
    this.maxKeys = maxKeys;
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): void {
    // Evict oldest entries if maxKeys is set and we're at capacity
    if (this.maxKeys > 0 && !this.cache.has(key)) {
      const keys = this.cache.keys();
      if (keys.length >= this.maxKeys) {
        // Evict the first (oldest) key
        this.cache.del(keys[0]);
      }
    }
    if (ttl !== undefined) {
      this.cache.set(key, value, ttl);
    } else {
      this.cache.set(key, value);
    }
  }

  del(key: string): void {
    this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Return all keys currently stored in the cache. */
  keys(): string[] {
    return this.cache.keys();
  }

  /** Return cache statistics (hits, misses, key count, memory sizes). */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /** Return the default TTL (in seconds) configured for this cache instance. */
  getTtl(): number {
    return this.ttlSeconds;
  }

  /** Return the maximum number of keys (0 = unlimited). */
  getMaxKeys(): number {
    return this.maxKeys;
  }
}

// ---------------------------------------------------------------------------
// CacheRegistry — central registry of named cache instances
// ---------------------------------------------------------------------------

class CacheRegistry {
  private static instances = new Map<string, CacheManager>();

  /**
   * Register a cache instance under a descriptive name.
   * Returns the same CacheManager for convenient inline usage:
   *   const myCache = CacheRegistry.register('my-cache', new CacheManager(3600));
   */
  static register(name: string, cache: CacheManager): CacheManager {
    this.instances.set(name, cache);
    return cache;
  }

  /** Retrieve a registered cache by name. */
  static get(name: string): CacheManager | undefined {
    return this.instances.get(name);
  }

  /** List every registered cache instance with its name. */
  static getAll(): Array<{ name: string; cache: CacheManager }> {
    return Array.from(this.instances.entries()).map(([name, cache]) => ({
      name,
      cache,
    }));
  }

  /** Flush a single cache by name. Returns false if the name is unknown. */
  static flush(name: string): boolean {
    const cache = this.instances.get(name);
    if (!cache) return false;
    cache.flush();
    return true;
  }

  /** Flush every registered cache. */
  static flushAll(): void {
    for (const cache of this.instances.values()) {
      cache.flush();
    }
  }
}

// ---------------------------------------------------------------------------
// Default global cache (legacy — used by bookinfo & musicbrainz APIs)
// ---------------------------------------------------------------------------

const cacheManager = CacheRegistry.register(
  'global',
  new CacheManager()
);

export { CacheManager, CacheRegistry };
export default cacheManager;
