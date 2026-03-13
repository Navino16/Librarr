import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import dataSource from '@server/datasource';
import logger from '@server/logger';
import { downloadSyncReset } from '@server/job/downloadSyncReset';

function makeRepo(findResult: any[] = []) {
  return {
    find: vi.fn().mockResolvedValue(findResult),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('downloadSyncReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataSource.getRepository).mockReset();
  });

  it('resets stale book requests and saves', async () => {
    const staleBook = {
      downloadProgress: 50,
      downloadStatus: 'downloading',
      downloadTimeLeft: '10m',
    };
    const bookRepo = makeRepo([staleBook]);
    const musicRepo = makeRepo([]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    expect(staleBook.downloadProgress).toBeUndefined();
    expect(staleBook.downloadStatus).toBeUndefined();
    expect(staleBook.downloadTimeLeft).toBeUndefined();
    expect(bookRepo.save).toHaveBeenCalledWith([staleBook]);
    expect(vi.mocked(logger.info).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('1 book request(s)')
    )).toBe(true);
  });

  it('resets stale music requests and saves', async () => {
    const staleMusic = {
      downloadProgress: 75,
      downloadStatus: 'downloading',
      downloadTimeLeft: '5m',
    };
    const bookRepo = makeRepo([]);
    const musicRepo = makeRepo([staleMusic]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    expect(staleMusic.downloadProgress).toBeUndefined();
    expect(staleMusic.downloadStatus).toBeUndefined();
    expect(staleMusic.downloadTimeLeft).toBeUndefined();
    expect(musicRepo.save).toHaveBeenCalledWith([staleMusic]);
    expect(vi.mocked(logger.info).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('1 music request(s)')
    )).toBe(true);
  });

  it('resets both book and music stale requests', async () => {
    const staleBook = { downloadProgress: 10, downloadStatus: 'x', downloadTimeLeft: '1m' };
    const staleMusic = { downloadProgress: 20, downloadStatus: 'y', downloadTimeLeft: '2m' };

    const bookRepo = makeRepo([staleBook]);
    const musicRepo = makeRepo([staleMusic]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    expect(bookRepo.save).toHaveBeenCalled();
    expect(musicRepo.save).toHaveBeenCalled();
    // Should NOT log "no stale download data found"
    expect(vi.mocked(logger.debug).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('no stale download data found')
    )).toBe(false);
  });

  it('logs debug when no stale requests found', async () => {
    const bookRepo = makeRepo([]);
    const musicRepo = makeRepo([]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    expect(vi.mocked(logger.debug).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('no stale download data found')
    )).toBe(true);
  });

  it('does not save when no stale requests found', async () => {
    const bookRepo = makeRepo([]);
    const musicRepo = makeRepo([]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    expect(bookRepo.save).not.toHaveBeenCalled();
    expect(musicRepo.save).not.toHaveBeenCalled();
  });

  it('handles multiple stale book requests', async () => {
    const staleBooks = [
      { downloadProgress: 10, downloadStatus: 'a', downloadTimeLeft: '1m' },
      { downloadProgress: 20, downloadStatus: 'b', downloadTimeLeft: '2m' },
      { downloadProgress: 30, downloadStatus: 'c', downloadTimeLeft: '3m' },
    ];
    const bookRepo = makeRepo(staleBooks);
    const musicRepo = makeRepo([]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    for (const req of staleBooks) {
      expect(req.downloadProgress).toBeUndefined();
      expect(req.downloadStatus).toBeUndefined();
      expect(req.downloadTimeLeft).toBeUndefined();
    }
    expect(bookRepo.save).toHaveBeenCalledWith(staleBooks);
    expect(vi.mocked(logger.info).mock.calls.some(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('3 book request(s)')
    )).toBe(true);
  });

  it('passes correct where clause to find', async () => {
    const bookRepo = makeRepo([]);
    const musicRepo = makeRepo([]);

    vi.mocked(dataSource.getRepository)
      .mockReturnValueOnce(bookRepo as any)
      .mockReturnValueOnce(musicRepo as any);

    await downloadSyncReset();

    const bookFindCall = bookRepo.find.mock.calls[0][0];
    expect(bookFindCall.where.status).toBe(2); // RequestStatus.APPROVED
    expect(bookFindCall.where.downloadStatus).toBeDefined();
    expect(bookFindCall.where.updatedAt).toBeDefined();
  });
});
