import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { capturedConfigs } = vi.hoisted(() => ({
  capturedConfigs: [] as any[],
}));

vi.mock('typeorm', () => ({
  DataSource: function MockDataSource(this: any, config: any) {
    capturedConfigs.push(config);
    return this;
  },
}));

// Mock all entity imports to avoid TypeORM decorator issues
vi.mock('@server/entity/User', () => ({ User: class {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class {} }));
vi.mock('@server/entity/Work', () => ({ Work: class {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class {} }));
vi.mock('@server/entity/Author', () => ({ Author: class {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class {} }));
vi.mock('@server/entity/Series', () => ({ Series: class {} }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class {} }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: class {} }));
vi.mock('@server/entity/Issue', () => ({ Issue: class {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: class {} }));
vi.mock('@server/entity/Session', () => ({ Session: class {} }));
vi.mock('@server/entity/UnmatchedMediaItem', () => ({ UnmatchedMediaItem: class {} }));
vi.mock('reflect-metadata', () => ({}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('datasource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    capturedConfigs.length = 0;
  });

  it('creates a DataSource with better-sqlite3 config', async () => {
    await import('@server/datasource');
    expect(capturedConfigs).toHaveLength(1);
    expect(capturedConfigs[0]).toEqual(
      expect.objectContaining({
        type: 'better-sqlite3',
        enableWAL: true,
      }),
    );
  });

  it('disables synchronize in production regardless of env var', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_SYNCHRONIZE', 'true');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await import('@server/datasource');

    expect(capturedConfigs[0].synchronize).toBe(false);
    spy.mockRestore();
  });

  it('warns when DB_SYNCHRONIZE=true in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_SYNCHRONIZE', 'true');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await import('@server/datasource');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('DB_SYNCHRONIZE=true in production'));
    spy.mockRestore();
  });

  it('enables synchronize in dev when DB_SYNCHRONIZE=true', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_SYNCHRONIZE', 'true');

    await import('@server/datasource');

    expect(capturedConfigs[0].synchronize).toBe(true);
  });

  it('disables synchronize when DB_SYNCHRONIZE is not set', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_SYNCHRONIZE', '');

    await import('@server/datasource');

    expect(capturedConfigs[0].synchronize).toBe(false);
  });

  it('enables migrationsRun in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await import('@server/datasource');

    expect(capturedConfigs[0].migrationsRun).toBe(true);
    spy.mockRestore();
  });

  it('disables migrationsRun in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await import('@server/datasource');

    expect(capturedConfigs[0].migrationsRun).toBe(false);
  });
});
