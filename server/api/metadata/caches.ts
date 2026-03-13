/**
 * Pre-registered cache instances for metadata providers.
 *
 * Each provider should import its cache from here so that every instance is
 * automatically visible in the CacheRegistry (and therefore in the backoffice
 * monitoring / flush endpoints).
 */
import { CacheManager, CacheRegistry } from '../../lib/cache';

/** Hardcover metadata cache — 1 hour TTL */
export const hardcoverCache = CacheRegistry.register(
  'hardcover',
  new CacheManager(3600, 5000)
);

/** Open Library metadata cache — 1 hour TTL, max 1000 entries */
export const openLibraryCache = CacheRegistry.register(
  'openlibrary',
  new CacheManager(3600, 1000)
);

/** Google Books metadata cache — 24 hour TTL, max 500 entries */
export const googleBooksCache = CacheRegistry.register(
  'googlebooks',
  new CacheManager(86400, 500)
);
