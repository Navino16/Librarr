import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@server/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/job/availabilitySync', () => ({
  availabilitySync: vi.fn(),
}));

import logger from '@server/logger';
import { availabilitySync } from '@server/job/availabilitySync';
import { mediaServerSync } from '@server/job/mediaServerSync';

describe('mediaServerSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls availabilitySync with fullScan: true', async () => {
    vi.mocked(availabilitySync).mockResolvedValue(undefined);

    await mediaServerSync();

    expect(availabilitySync).toHaveBeenCalledWith({ fullScan: true });
  });

  it('logs info start and complete', async () => {
    vi.mocked(availabilitySync).mockResolvedValue(undefined);

    await mediaServerSync();

    expect(vi.mocked(logger.info).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('starting daily rescan')
    )).toBe(true);
    expect(vi.mocked(logger.info).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('complete')
    )).toBe(true);
  });

  it('logs error when availabilitySync throws, does not re-throw', async () => {
    vi.mocked(availabilitySync).mockRejectedValue(new Error('sync fail'));

    // Should not throw
    await expect(mediaServerSync()).resolves.toBeUndefined();

    expect(vi.mocked(logger.error).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('failed')
    )).toBe(true);
  });

  it('does not log complete when availabilitySync throws', async () => {
    vi.mocked(availabilitySync).mockRejectedValue(new Error('fail'));

    await mediaServerSync();

    const completeLogs = vi.mocked(logger.info).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('complete')
    );
    expect(completeLogs.length).toBe(0);
  });
});
