import { describe, it, expect, vi } from 'vitest';

vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class {} }));

describe('localizeMedia', () => {
  it('returns requests unchanged (stub)', async () => {
    const { localizeBookRequests } = await import('@server/lib/localizeMedia');
    const requests = [{ id: 1 }, { id: 2 }] as any[];
    const result = await localizeBookRequests(requests, 'fr');
    expect(result).toBe(requests);
  });

  it('handles empty array', async () => {
    const { localizeBookRequests } = await import('@server/lib/localizeMedia');
    const result = await localizeBookRequests([], 'en');
    expect(result).toEqual([]);
  });
});
