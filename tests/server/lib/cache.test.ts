import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager, CacheRegistry } from '@server/lib/cache';

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(300, 100);
  });

  it('returns undefined for a missing key', () => {
    expect(cache.get('nope')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('stores with a custom TTL', () => {
    cache.set('short', 42, 1);
    expect(cache.get('short')).toBe(42);
  });

  it('deletes a key', () => {
    cache.set('a', 1);
    cache.del('a');
    expect(cache.get('a')).toBeUndefined();
  });

  it('flushes all keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.flush();
    expect(cache.keys()).toHaveLength(0);
  });

  it('has() returns true for existing key and false otherwise', () => {
    cache.set('x', 1);
    expect(cache.has('x')).toBe(true);
    expect(cache.has('y')).toBe(false);
  });

  it('keys() returns all stored keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys().sort()).toEqual(['a', 'b']);
  });

  it('getStats() returns stats object', () => {
    const stats = cache.getStats();
    expect(stats).toHaveProperty('keys');
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('ksize');
    expect(stats).toHaveProperty('vsize');
  });

  it('getTtl() returns the configured TTL', () => {
    expect(cache.getTtl()).toBe(300);
  });

  it('getMaxKeys() returns the configured limit', () => {
    expect(cache.getMaxKeys()).toBe(100);
  });

  it('evicts the oldest key when maxKeys is reached', () => {
    const small = new CacheManager(300, 3);
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3);
    // At capacity — adding a 4th should evict 'a'
    small.set('d', 4);
    expect(small.has('a')).toBe(false);
    expect(small.keys()).toHaveLength(3);
    expect(small.has('d')).toBe(true);
  });

  it('does not evict when updating an existing key at capacity', () => {
    const small = new CacheManager(300, 2);
    small.set('a', 1);
    small.set('b', 2);
    // Updating 'a' should NOT evict anything
    small.set('a', 10);
    expect(small.get('a')).toBe(10);
    expect(small.get('b')).toBe(2);
    expect(small.keys()).toHaveLength(2);
  });

  it('does not evict when maxKeys is 0 (unlimited)', () => {
    const unlimited = new CacheManager(300, 0);
    for (let i = 0; i < 50; i++) {
      unlimited.set(`k${i}`, i);
    }
    expect(unlimited.keys()).toHaveLength(50);
  });
});

describe('CacheRegistry', () => {
  beforeEach(() => {
    CacheRegistry.flushAll();
    // Clear registry by flushing — note: we can't remove entries,
    // but we test with unique names per test
  });

  it('register() stores and returns the cache instance', () => {
    const c = new CacheManager(60, 10);
    const result = CacheRegistry.register('test-reg', c);
    expect(result).toBe(c);
  });

  it('get() retrieves a registered cache', () => {
    const c = new CacheManager(60, 10);
    CacheRegistry.register('test-get', c);
    expect(CacheRegistry.get('test-get')).toBe(c);
  });

  it('get() returns undefined for unknown name', () => {
    expect(CacheRegistry.get('nonexistent-xyz')).toBeUndefined();
  });

  it('getAll() includes registered caches', () => {
    const c = new CacheManager(60, 10);
    CacheRegistry.register('test-all', c);
    const all = CacheRegistry.getAll();
    const names = all.map((e) => e.name);
    expect(names).toContain('test-all');
  });

  it('flush() by name returns true and clears the cache', () => {
    const c = new CacheManager(60, 10);
    CacheRegistry.register('test-flush', c);
    c.set('k', 1);
    expect(CacheRegistry.flush('test-flush')).toBe(true);
    expect(c.keys()).toHaveLength(0);
  });

  it('flush() returns false for unknown name', () => {
    expect(CacheRegistry.flush('unknown-abc')).toBe(false);
  });

  it('flushAll() clears every registered cache', () => {
    const c1 = new CacheManager(60, 10);
    const c2 = new CacheManager(60, 10);
    CacheRegistry.register('test-fa1', c1);
    CacheRegistry.register('test-fa2', c2);
    c1.set('a', 1);
    c2.set('b', 2);

    CacheRegistry.flushAll();

    expect(c1.keys()).toHaveLength(0);
    expect(c2.keys()).toHaveLength(0);
  });
});
