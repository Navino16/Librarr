import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@server/lib/settings', () => ({
  default: {
    getInstance: vi.fn(() => ({
      metadataProviders: { hardcover: { enabled: true } },
    })),
  },
}));
vi.mock('@server/api/metadata', () => ({
  MetadataResolver: vi.fn(),
}));

import { MetadataResolver } from '@server/api/metadata';
import { getMetadataResolver, resetMetadataResolver } from '@server/lib/metadataResolverInstance';

const MockedMetadataResolver = vi.mocked(MetadataResolver);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the singleton between tests
  resetMetadataResolver();
});

// ---------------------------------------------------------------------------
// getMetadataResolver()
// ---------------------------------------------------------------------------

describe('getMetadataResolver()', () => {
  it('creates a MetadataResolver instance on first call', () => {
    getMetadataResolver();

    expect(MockedMetadataResolver).toHaveBeenCalledTimes(1);
    expect(MockedMetadataResolver).toHaveBeenCalledWith({
      hardcover: { enabled: true },
    });
  });

  it('returns the same instance on subsequent calls (singleton)', () => {
    const first = getMetadataResolver();
    const second = getMetadataResolver();

    expect(first).toBe(second);
    expect(MockedMetadataResolver).toHaveBeenCalledTimes(1);
  });

  it('passes settings.metadataProviders to MetadataResolver constructor', () => {
    getMetadataResolver();

    expect(MockedMetadataResolver).toHaveBeenCalledWith({
      hardcover: { enabled: true },
    });
  });
});

// ---------------------------------------------------------------------------
// resetMetadataResolver()
// ---------------------------------------------------------------------------

describe('resetMetadataResolver()', () => {
  it('creates a new instance after reset', () => {
    getMetadataResolver();
    expect(MockedMetadataResolver).toHaveBeenCalledTimes(1);

    resetMetadataResolver();
    getMetadataResolver();

    expect(MockedMetadataResolver).toHaveBeenCalledTimes(2);
  });
});
