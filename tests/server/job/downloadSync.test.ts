import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock factories run
const { mockGetQueue, mockLidarrGetQueue } = vi.hoisted(() => ({
  mockGetQueue: vi.fn(),
  mockLidarrGetQueue: vi.fn(),
}));

// ---- Mocks ----
vi.mock('@server/datasource', () => ({
  default: { getRepository: vi.fn() },
}));
vi.mock('@server/entity/BookRequest', () => ({
  BookRequest: class BookRequest {},
}));
vi.mock('@server/entity/MusicRequest', () => ({
  MusicRequest: class MusicRequest {},
}));
vi.mock('@server/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));
vi.mock('@server/lib/serverUrl', () => ({
  buildServerUrl: vi.fn().mockReturnValue('http://readarr:8787'),
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function () { return { getQueue: mockGetQueue }; }),
}));

vi.mock('@server/api/servarr/lidarr', () => ({
  default: vi.fn().mockImplementation(function () { return { getQueue: mockLidarrGetQueue }; }),
}));

import dataSource from '@server/datasource';
import logger from '@server/logger';
import Settings from '@server/lib/settings';
import { downloadSync } from '@server/job/downloadSync';

function makeRepo(findResult: any[] = []) {
  return {
    find: vi.fn().mockResolvedValue(findResult),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('downloadSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataSource.getRepository).mockReset();
  });

  // ------------------------------------------------------------------
  // syncBookRequests (exercised via downloadSync)
  // ------------------------------------------------------------------
  describe('syncBookRequests', () => {
    it('skips when no active book requests', async () => {
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      await downloadSync();

      expect(vi.mocked(logger.debug).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('no active book requests')
      )).toBe(true);
    });

    it('groups requests by readarrServerId and polls each server', async () => {
      const requests = [
        { readarrServerId: 1, readarrBookId: 100 },
        { readarrServerId: 1, readarrBookId: 101 },
        { readarrServerId: 2, readarrBookId: 200 },
      ];
      const bookRepo = makeRepo(requests);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, name: 'Readarr1', apiKey: 'k1' },
          { id: 2, name: 'Readarr2', apiKey: 'k2' },
        ],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([]);

      await downloadSync();

      // Two servers polled → two save calls
      expect(bookRepo.save).toHaveBeenCalledTimes(2);
    });

    it('calculates downloadProgress from size/sizeleft', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: 42,
        downloadProgress: undefined as number | undefined,
        downloadStatus: undefined as string | undefined,
        downloadTimeLeft: undefined as string | undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([
        {
          bookId: 42,
          size: 1000,
          sizeleft: 250,
          status: 'downloading',
          trackedDownloadStatus: 'ok',
          timeleft: '5:00',
        },
      ]);

      await downloadSync();

      // (1000 - 250) / 1000 = 0.75 → 75
      expect(request.downloadProgress).toBe(75);
      expect(request.downloadStatus).toBe('ok');
      expect(request.downloadTimeLeft).toBe('5:00');
    });

    it('uses status when trackedDownloadStatus is undefined', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: 42,
        downloadProgress: undefined as number | undefined,
        downloadStatus: undefined as string | undefined,
        downloadTimeLeft: undefined as string | undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([
        {
          bookId: 42,
          size: 100,
          sizeleft: 50,
          status: 'queued',
          trackedDownloadStatus: undefined,
        },
      ]);

      await downloadSync();

      expect(request.downloadStatus).toBe('queued');
    });

    it('handles zero size (progress=0)', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: 42,
        downloadProgress: undefined as number | undefined,
        downloadStatus: undefined as string | undefined,
        downloadTimeLeft: undefined as string | undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([
        { bookId: 42, size: 0, sizeleft: 0, status: 'queued' },
      ]);

      await downloadSync();

      expect(request.downloadProgress).toBe(0);
    });

    it('clears download data when request not in queue and had progress', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: 42,
        downloadProgress: 50 as number | undefined,
        downloadStatus: 'downloading' as string | undefined,
        downloadTimeLeft: '5m' as string | undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([]);

      await downloadSync();

      expect(request.downloadProgress).toBeUndefined();
      expect(request.downloadStatus).toBeUndefined();
      expect(request.downloadTimeLeft).toBeUndefined();
    });

    it('does not clear when request not in queue but had no progress', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: 42,
        downloadProgress: undefined,
        downloadStatus: undefined,
        downloadTimeLeft: undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([]);

      await downloadSync();

      expect(request.downloadProgress).toBeUndefined();
    });

    it('warns when server not found in settings', async () => {
      const request = { readarrServerId: 999, readarrBookId: 1 };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
        lidarr: [],
      } as any);

      await downloadSync();

      expect(vi.mocked(logger.warn).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('999 not found in settings')
      )).toBe(true);
    });

    it('catches API error and continues with other servers', async () => {
      const req1 = { readarrServerId: 1, readarrBookId: 10 };
      const req2 = { readarrServerId: 2, readarrBookId: 20 };
      const bookRepo = makeRepo([req1, req2]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, name: 'Fail', apiKey: 'k1' },
          { id: 2, name: 'OK', apiKey: 'k2' },
        ],
        lidarr: [],
      } as any);

      mockGetQueue
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce([]);

      await downloadSync();

      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('failed to poll Readarr server "Fail"')
      )).toBe(true);

      // Second server still processed
      expect(bookRepo.save).toHaveBeenCalledTimes(1);
    });

    it('skips request without readarrBookId', async () => {
      const request = {
        readarrServerId: 1,
        readarrBookId: undefined,
        downloadProgress: undefined,
      };
      const bookRepo = makeRepo([request]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, name: 'R', apiKey: 'k' }],
        lidarr: [],
      } as any);

      mockGetQueue.mockResolvedValue([]);

      await downloadSync();

      expect(request.downloadProgress).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // syncMusicRequests (exercised via downloadSync)
  // ------------------------------------------------------------------
  describe('syncMusicRequests', () => {
    it('skips when no active music requests', async () => {
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      await downloadSync();

      expect(vi.mocked(logger.debug).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('no active music requests')
      )).toBe(true);
    });

    it('calculates progress for music requests', async () => {
      const request = {
        lidarrServerId: 1,
        lidarrAlbumId: 55,
        downloadProgress: undefined as number | undefined,
        downloadStatus: undefined as string | undefined,
        downloadTimeLeft: undefined as string | undefined,
      };
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([request]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
        lidarr: [{ id: 1, name: 'Lidarr1', apiKey: 'k' }],
      } as any);

      mockLidarrGetQueue.mockResolvedValue([
        {
          albumId: 55,
          size: 200,
          sizeleft: 50,
          status: 'downloading',
          trackedDownloadStatus: 'ok',
          timeleft: '2:00',
        },
      ]);

      await downloadSync();

      expect(request.downloadProgress).toBe(75);
      expect(request.downloadStatus).toBe('ok');
      expect(request.downloadTimeLeft).toBe('2:00');
    });

    it('clears music download data when not in queue', async () => {
      const request = {
        lidarrServerId: 1,
        lidarrAlbumId: 55,
        downloadProgress: 30 as number | undefined,
        downloadStatus: 'downloading' as string | undefined,
        downloadTimeLeft: '3m' as string | undefined,
      };
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([request]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
        lidarr: [{ id: 1, name: 'Lidarr1', apiKey: 'k' }],
      } as any);

      mockLidarrGetQueue.mockResolvedValue([]);

      await downloadSync();

      expect(request.downloadProgress).toBeUndefined();
      expect(request.downloadStatus).toBeUndefined();
      expect(request.downloadTimeLeft).toBeUndefined();
    });

    it('warns when lidarr server not found in settings', async () => {
      const request = { lidarrServerId: 999, lidarrAlbumId: 1 };
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([request]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
        lidarr: [],
      } as any);

      await downloadSync();

      expect(vi.mocked(logger.warn).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Lidarr server 999 not found')
      )).toBe(true);
    });

    it('catches lidarr API error and logs', async () => {
      const request = { lidarrServerId: 1, lidarrAlbumId: 10 };
      const bookRepo = makeRepo([]);
      const musicRepo = makeRepo([request]);

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(bookRepo as any)
        .mockReturnValueOnce(musicRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
        lidarr: [{ id: 1, name: 'LidarrFail', apiKey: 'k' }],
      } as any);

      mockLidarrGetQueue.mockRejectedValue(new Error('timeout'));

      await downloadSync();

      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('failed to poll Lidarr server "LidarrFail"')
      )).toBe(true);
    });
  });
});
