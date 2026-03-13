import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks (before any import of the module under test) ----

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: vi.fn(),
  },
}));

vi.mock('@server/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/job/downloadSync', () => ({
  downloadSync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@server/job/availabilitySync', () => ({
  availabilitySync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@server/job/arrLibraryScan', () => ({
  arrLibraryScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@server/job/mediaServerSync', () => ({
  mediaServerSync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@server/job/downloadSyncReset', () => ({
  downloadSyncReset: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@server/lib/cache', () => ({
  CacheRegistry: { get: vi.fn() },
}));

import schedule from 'node-schedule';
import logger from '@server/logger';

/**
 * Helper: fresh-import the schedule module to reset module-level state
 * (jobs Map, jobDefinitions array, runningJobs Set).
 */
async function freshImport() {
  vi.resetModules();
  const mod = await import('@server/job/schedule');
  return mod;
}

describe('schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // initScheduler
  // ------------------------------------------------------------------
  describe('initScheduler', () => {
    it('calls scheduleJob 7 times', async () => {
      const mockJob = { cancel: vi.fn(), nextInvocation: vi.fn() };
      vi.mocked(schedule.scheduleJob).mockReturnValue(mockJob as any);

      const { initScheduler } = await freshImport();
      initScheduler();

      expect(schedule.scheduleJob).toHaveBeenCalledTimes(7);
    });

    it('logs info for each scheduled job', async () => {
      const mockJob = { cancel: vi.fn(), nextInvocation: vi.fn() };
      vi.mocked(schedule.scheduleJob).mockReturnValue(mockJob as any);

      const { initScheduler } = await freshImport();
      initScheduler();

      // 7 "Scheduled job:" lines
      const scheduledLogs = vi.mocked(logger.info).mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && args[0].startsWith('Scheduled job:')
      );
      expect(scheduledLogs.length).toBe(7);
    });

    it('does not store job when scheduleJob returns null', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue(null as any);

      const { initScheduler, getJobs } = await freshImport();
      initScheduler();

      // Jobs are registered but have no nextRun
      const jobs = getJobs();
      expect(jobs.length).toBe(7);
      for (const j of jobs) {
        expect(j.nextRun).toBeUndefined();
      }
    });
  });

  // ------------------------------------------------------------------
  // getJobs
  // ------------------------------------------------------------------
  describe('getJobs', () => {
    it('returns 7 jobs after initScheduler with running=false', async () => {
      const mockJob = {
        cancel: vi.fn(),
        nextInvocation: vi.fn().mockReturnValue(new Date('2025-01-01')),
      };
      vi.mocked(schedule.scheduleJob).mockReturnValue(mockJob as any);

      const { initScheduler, getJobs } = await freshImport();
      initScheduler();

      const jobs = getJobs();
      expect(jobs.length).toBe(7);
      for (const j of jobs) {
        expect(j).toHaveProperty('id');
        expect(j).toHaveProperty('name');
        expect(j).toHaveProperty('schedule');
        expect(j.running).toBe(false);
      }
    });

    it('returns running=true when a job callback is executing', async () => {
      let capturedCallback: (() => Promise<void>) | null = null;

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        // Capture the first callback (download-sync)
        if (!capturedCallback) {
          capturedCallback = cb as () => Promise<void>;
        }
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      // Make the job function hang so it stays "running"
      const { downloadSync } = await import('@server/job/downloadSync');
      let resolveDownload!: () => void;
      vi.mocked(downloadSync).mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
      );

      const { initScheduler, getJobs } = await freshImport();
      initScheduler();

      // Start the job callback (don't await — it's still running)
      const runPromise = capturedCallback!();

      // While running, getJobs should show running=true
      const jobs = getJobs();
      const downloadSyncJob = jobs.find((j) => j.id === 'download-sync');
      expect(downloadSyncJob?.running).toBe(true);

      // Complete
      resolveDownload();
      await runPromise;

      const jobsAfter = getJobs();
      expect(jobsAfter.find((j) => j.id === 'download-sync')?.running).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // runJob
  // ------------------------------------------------------------------
  describe('runJob', () => {
    it('returns false for unknown jobId', async () => {
      const mockJob = { cancel: vi.fn(), nextInvocation: vi.fn() };
      vi.mocked(schedule.scheduleJob).mockReturnValue(mockJob as any);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('nonexistent')).toBe(false);
    });

    it('returns false if job is already running', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { downloadSync } = await import('@server/job/downloadSync');
      let resolveDownload!: () => void;
      vi.mocked(downloadSync).mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
      );

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      // First call starts it
      expect(runJob('download-sync')).toBe(true);
      // Second call while running
      expect(runJob('download-sync')).toBe(false);

      resolveDownload();
      // Let microtasks settle
      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job download-sync completed')
        )).toBe(true);
      });
    });

    it('returns true and executes fn, logs completed', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { downloadSync } = await import('@server/job/downloadSync');
      vi.mocked(downloadSync).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      const result = runJob('download-sync');
      expect(result).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job download-sync completed')
        )).toBe(true);
      });
    });

    it('runs availability-sync job successfully', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { availabilitySync } = await import('@server/job/availabilitySync');
      vi.mocked(availabilitySync).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('availability-sync')).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job availability-sync completed')
        )).toBe(true);
      });
    });

    it('runs readarr-scan job successfully', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { arrLibraryScan } = await import('@server/job/arrLibraryScan');
      vi.mocked(arrLibraryScan).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('readarr-scan')).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job readarr-scan completed')
        )).toBe(true);
      });
    });

    it('runs lidarr-scan job successfully', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { arrLibraryScan } = await import('@server/job/arrLibraryScan');
      vi.mocked(arrLibraryScan).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('lidarr-scan')).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job lidarr-scan completed')
        )).toBe(true);
      });
    });

    it('runs media-server-sync job successfully', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { mediaServerSync } = await import('@server/job/mediaServerSync');
      vi.mocked(mediaServerSync).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('media-server-sync')).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job media-server-sync completed')
        )).toBe(true);
      });
    });

    it('runs download-sync-reset job successfully', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { downloadSyncReset } = await import('@server/job/downloadSyncReset');
      vi.mocked(downloadSyncReset).mockResolvedValue(undefined);

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      expect(runJob('download-sync-reset')).toBe(true);

      await vi.waitFor(() => {
        expect(vi.mocked(logger.info).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job download-sync-reset completed')
        )).toBe(true);
      });
    });

    it('logs failed when fn rejects', async () => {
      vi.mocked(schedule.scheduleJob).mockReturnValue({
        cancel: vi.fn(),
        nextInvocation: vi.fn(),
      } as any);

      const { downloadSync } = await import('@server/job/downloadSync');
      vi.mocked(downloadSync).mockRejectedValue(new Error('boom'));

      const { initScheduler, runJob } = await freshImport();
      initScheduler();

      runJob('download-sync');

      await vi.waitFor(() => {
        expect(vi.mocked(logger.error).mock.calls.some(
          (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Manual job download-sync failed')
        )).toBe(true);
      });
    });
  });

  // ------------------------------------------------------------------
  // shutdownScheduler
  // ------------------------------------------------------------------
  describe('shutdownScheduler', () => {
    it('calls cancel on each scheduled job and logs', async () => {
      const mockJob = { cancel: vi.fn(), nextInvocation: vi.fn() };
      vi.mocked(schedule.scheduleJob).mockReturnValue(mockJob as any);

      const { initScheduler, shutdownScheduler } = await freshImport();
      initScheduler();
      shutdownScheduler();

      // cancel called 7 times (once per job)
      expect(mockJob.cancel).toHaveBeenCalledTimes(7);

      const cancelledLogs = vi.mocked(logger.info).mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && args[0].startsWith('Cancelled job:')
      );
      expect(cancelledLogs.length).toBe(7);
    });
  });

  // ------------------------------------------------------------------
  // Schedule callbacks
  // ------------------------------------------------------------------
  describe('schedule callbacks', () => {
    it('skips if job already running', async () => {
      let capturedCallback: (() => Promise<void>) | null = null;

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        if (!capturedCallback) {
          capturedCallback = cb as () => Promise<void>;
        }
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      const { downloadSync } = await import('@server/job/downloadSync');
      let resolveDownload!: () => void;
      vi.mocked(downloadSync).mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
      );

      const { initScheduler } = await freshImport();
      initScheduler();

      // Start callback
      const p1 = capturedCallback!();
      // Call again while running
      await capturedCallback!();

      expect(vi.mocked(logger.debug).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('skipped: already running')
      )).toBe(true);

      resolveDownload();
      await p1;
    });

    it('logs started and completed on success', async () => {
      let capturedCallback: (() => Promise<void>) | null = null;

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        if (!capturedCallback) {
          capturedCallback = cb as () => Promise<void>;
        }
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      const { downloadSync } = await import('@server/job/downloadSync');
      vi.mocked(downloadSync).mockResolvedValue(undefined);

      const { initScheduler } = await freshImport();
      initScheduler();

      await capturedCallback!();

      expect(vi.mocked(logger.info).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('started')
      )).toBe(true);
      expect(vi.mocked(logger.info).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('completed')
      )).toBe(true);
    });

    it('catches error and logs failed', async () => {
      let capturedCallback: (() => Promise<void>) | null = null;

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        if (!capturedCallback) {
          capturedCallback = cb as () => Promise<void>;
        }
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      const { downloadSync } = await import('@server/job/downloadSync');
      vi.mocked(downloadSync).mockRejectedValue(new Error('crash'));

      const { initScheduler } = await freshImport();
      initScheduler();

      await capturedCallback!();

      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('failed')
      )).toBe(true);
    });

    it('image-cache-cleanup callback does nothing when cache not found', async () => {
      const callbacks: Array<() => Promise<void>> = [];

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        callbacks.push(cb as () => Promise<void>);
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      const { CacheRegistry } = await import('@server/lib/cache');
      vi.mocked(CacheRegistry.get).mockReturnValue(undefined as any);

      const { initScheduler } = await freshImport();
      initScheduler();

      // image-cache-cleanup is the 7th registered job (index 6)
      await callbacks[6]();

      expect(vi.mocked(logger.info).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Image cache flushed')
      )).toBe(false);
    });

    it('image-cache-cleanup callback flushes cache when present', async () => {
      const callbacks: Array<() => Promise<void>> = [];

      vi.mocked(schedule.scheduleJob).mockImplementation((_cronExpr, cb) => {
        callbacks.push(cb as () => Promise<void>);
        return { cancel: vi.fn(), nextInvocation: vi.fn() } as any;
      });

      const { CacheRegistry } = await import('@server/lib/cache');
      const mockFlush = vi.fn();
      vi.mocked(CacheRegistry.get).mockReturnValue({ flush: mockFlush } as any);

      const { initScheduler } = await freshImport();
      initScheduler();

      // image-cache-cleanup is the 7th registered job (index 6)
      await callbacks[6]();

      expect(mockFlush).toHaveBeenCalled();
      expect(vi.mocked(logger.info).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Image cache flushed')
      )).toBe(true);
    });
  });
});
