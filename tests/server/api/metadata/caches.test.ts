import { describe, it, expect } from 'vitest';
import { hardcoverCache, openLibraryCache, googleBooksCache } from '@server/api/metadata/caches';
import { CacheRegistry } from '@server/lib/cache';

describe('metadata caches', () => {
  it('hardcoverCache has TTL=3600 and maxKeys=5000', () => {
    expect(hardcoverCache.getTtl()).toBe(3600);
    expect(hardcoverCache.getMaxKeys()).toBe(5000);
  });

  it('openLibraryCache has TTL=3600 and maxKeys=1000', () => {
    expect(openLibraryCache.getTtl()).toBe(3600);
    expect(openLibraryCache.getMaxKeys()).toBe(1000);
  });

  it('googleBooksCache has TTL=86400 and maxKeys=500', () => {
    expect(googleBooksCache.getTtl()).toBe(86400);
    expect(googleBooksCache.getMaxKeys()).toBe(500);
  });

  it('all three are registered in CacheRegistry', () => {
    const all = CacheRegistry.getAll();
    const names = all.map((e) => e.name);
    expect(names).toContain('hardcover');
    expect(names).toContain('openlibrary');
    expect(names).toContain('googlebooks');
  });

  it('CacheRegistry.get returns the correct instance', () => {
    expect(CacheRegistry.get('hardcover')).toBe(hardcoverCache);
    expect(CacheRegistry.get('openlibrary')).toBe(openLibraryCache);
    expect(CacheRegistry.get('googlebooks')).toBe(googleBooksCache);
  });
});
