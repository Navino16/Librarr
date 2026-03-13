import schedule from 'node-schedule';
import logger from '../logger';
import { downloadSync } from './downloadSync';
import { availabilitySync } from './availabilitySync';
import { arrLibraryScan } from './arrLibraryScan';
import { mediaServerSync } from './mediaServerSync';
import { downloadSyncReset } from './downloadSyncReset';
import { CacheRegistry } from '../lib/cache';

interface JobDefinition {
  id: string;
  name: string;
  schedule: string;
  fn: () => Promise<void>;
}

const jobs: Map<string, schedule.Job> = new Map();
const jobDefinitions: JobDefinition[] = [];
const runningJobs = new Set<string>();

function registerJob(definition: JobDefinition) {
  jobDefinitions.push(definition);
}

export function initScheduler() {
  // Register all jobs
  registerJob({
    id: 'download-sync',
    name: 'Download Sync',
    schedule: '*/1 * * * *', // Every minute (webhooks handle critical events)
    fn: () => downloadSync(),
  });

  registerJob({
    id: 'availability-sync',
    name: 'Availability Sync',
    schedule: '*/15 * * * *', // Every 15 minutes (webhooks handle critical events)
    fn: () => availabilitySync(),
  });

  registerJob({
    id: 'readarr-scan',
    name: 'Readarr Library Scan',
    schedule: '0 3 * * *', // 3:00 AM daily
    fn: () => arrLibraryScan('readarr'),
  });

  registerJob({
    id: 'lidarr-scan',
    name: 'Lidarr Library Scan',
    schedule: '30 3 * * *', // 3:30 AM daily
    fn: () => arrLibraryScan('lidarr'),
  });

  registerJob({
    id: 'media-server-sync',
    name: 'Media Server Full Sync',
    schedule: '0 4 * * *', // 4:00 AM daily
    fn: () => mediaServerSync(),
  });

  registerJob({
    id: 'download-sync-reset',
    name: 'Download Sync Reset',
    schedule: '0 1 * * *', // 1:00 AM daily
    fn: () => downloadSyncReset(),
  });

  registerJob({
    id: 'image-cache-cleanup',
    name: 'Image Cache Cleanup',
    schedule: '0 6 * * *', // 6:00 AM daily
    fn: async () => {
      const imageCache = CacheRegistry.get('imageproxy');
      if (imageCache) {
        imageCache.flush();
        logger.info('Image cache flushed');
      }
    },
  });

  // Schedule all jobs
  for (const def of jobDefinitions) {
    const job = schedule.scheduleJob(def.schedule, async () => {
      if (runningJobs.has(def.id)) {
        logger.debug(`Job ${def.id} skipped: already running`);
        return;
      }
      runningJobs.add(def.id);
      const start = Date.now();
      logger.info(`Job ${def.id} started`);
      try {
        await def.fn();
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        logger.info(`Job ${def.id} completed in ${duration}s`);
      } catch (e) {
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        logger.error(`Job ${def.id} failed after ${duration}s`, { error: e });
      } finally {
        runningJobs.delete(def.id);
      }
    });
    if (job) {
      jobs.set(def.id, job);
      logger.info(`Scheduled job: ${def.name} (${def.schedule})`);
    }
  }
}

export function getJobs(): Array<{
  id: string;
  name: string;
  schedule: string;
  nextRun?: Date;
  running: boolean;
}> {
  return jobDefinitions.map((def) => {
    const job = jobs.get(def.id);
    return {
      id: def.id,
      name: def.name,
      schedule: def.schedule,
      nextRun: job?.nextInvocation() ? new Date(job.nextInvocation()!.getTime()) : undefined,
      running: runningJobs.has(def.id),
    };
  });
}

export function shutdownScheduler(): void {
  for (const [id, job] of jobs) {
    job.cancel();
    logger.info(`Cancelled job: ${id}`);
  }
  jobs.clear();
}

export function runJob(jobId: string): boolean {
  const def = jobDefinitions.find((d) => d.id === jobId);
  if (!def) return false;

  if (runningJobs.has(jobId)) {
    logger.debug(`Manual job ${jobId} skipped: already running`);
    return false;
  }
  runningJobs.add(jobId);

  const start = Date.now();
  logger.info(`Manual job ${jobId} started`);

  def.fn()
    .then(() => {
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      logger.info(`Manual job ${jobId} completed in ${duration}s`);
    })
    .catch((e) => {
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      logger.error(`Manual job ${jobId} failed after ${duration}s`, { error: e });
    })
    .finally(() => {
      runningJobs.delete(jobId);
    });

  return true;
}
