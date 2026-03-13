import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockHasPermission,
  mockGetManageRequestPermission,
  mockGetAutoApprovePermission,
  mockBookRequestRepo,
  mockMusicRequestRepo,
  mockWorkRepo,
  mockBookQb,
  mockMusicQb,
  mockTransaction,
  mockGetInstance,
  mockResolveWork,
  mockProcessApprovedBookRequest,
  mockProcessApprovedMusicRequest,
  mockUpdateQb,
  mockResolveEffectiveQuota,
  mockGetQuotaUsage,
} = vi.hoisted(() => {
  // Book query builder (GET / combined list)
  const mockBookQb: any = {};
  mockBookQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockBookQb);
  mockBookQb.andWhere = vi.fn().mockReturnValue(mockBookQb);
  mockBookQb.orderBy = vi.fn().mockReturnValue(mockBookQb);
  mockBookQb.take = vi.fn().mockReturnValue(mockBookQb);
  mockBookQb.skip = vi.fn().mockReturnValue(mockBookQb);
  mockBookQb.getMany = vi.fn().mockResolvedValue([]);
  mockBookQb.getManyAndCount = vi.fn().mockResolvedValue([[], 0]);
  mockBookQb.getCount = vi.fn().mockResolvedValue(0);

  // Music query builder (GET / combined list)
  const mockMusicQb: any = {};
  mockMusicQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockMusicQb);
  mockMusicQb.andWhere = vi.fn().mockReturnValue(mockMusicQb);
  mockMusicQb.orderBy = vi.fn().mockReturnValue(mockMusicQb);
  mockMusicQb.take = vi.fn().mockReturnValue(mockMusicQb);
  mockMusicQb.skip = vi.fn().mockReturnValue(mockMusicQb);
  mockMusicQb.getManyAndCount = vi.fn().mockResolvedValue([[], 0]);

  // Query builder used by updateWorkStatusAfterRequestChange
  const mockUpdateQb: any = {};
  mockUpdateQb.leftJoin = vi.fn().mockReturnValue(mockUpdateQb);
  mockUpdateQb.where = vi.fn().mockReturnValue(mockUpdateQb);
  mockUpdateQb.andWhere = vi.fn().mockReturnValue(mockUpdateQb);
  mockUpdateQb.getCount = vi.fn().mockResolvedValue(0);
  mockUpdateQb.getOne = vi.fn().mockResolvedValue(null);

  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockHasPermission: vi.fn().mockReturnValue(false),
    mockGetManageRequestPermission: vi.fn().mockReturnValue(512), // MANAGE_REQUESTS_EBOOK
    mockGetAutoApprovePermission: vi.fn().mockReturnValue(64), // AUTO_APPROVE_EBOOK
    mockBookRequestRepo: {
      createQueryBuilder: vi.fn().mockReturnValue(mockBookQb),
      findOne: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      save: vi.fn((data: any) => Promise.resolve(data)),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    mockMusicRequestRepo: {
      createQueryBuilder: vi.fn().mockReturnValue(mockMusicQb),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((data: any) => Promise.resolve(data)),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    mockWorkRepo: {
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((data: any) => Promise.resolve(data)),
    },
    mockBookQb,
    mockMusicQb,
    mockUpdateQb,
    mockTransaction: vi.fn(),
    mockGetInstance: vi.fn(),
    mockResolveWork: vi.fn(),
    mockProcessApprovedBookRequest: vi.fn().mockResolvedValue(undefined),
    mockProcessApprovedMusicRequest: vi.fn().mockResolvedValue(undefined),
    mockResolveEffectiveQuota: vi.fn().mockReturnValue(null),
    mockGetQuotaUsage: vi.fn().mockResolvedValue(0),
  };
});

// ---------------------------------------------------------------------------
// Sentinel classes for getRepository dispatch
// ---------------------------------------------------------------------------

class MockBookRequest {}
class MockMusicRequest {}
class MockWork {}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('express', async (importOriginal) => {
  const actual = await importOriginal<typeof import('express')>();
  return {
    ...actual,
    Router: vi.fn(() => {
      const r: any = {};
      for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
        r[m] = vi.fn((...args: any[]) => {
          handlers[`${m.toUpperCase()} ${args[0]}`] = args[args.length - 1];
          return r;
        });
      }
      r.use = vi.fn().mockReturnValue(r);
      return r;
    }),
  };
});

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockBookRequest) return mockBookRequestRepo;
      if (entity === MockMusicRequest) return mockMusicRequestRepo;
      if (entity === MockWork) return mockWorkRepo;
      return {};
    }),
    transaction: mockTransaction,
  },
}));

// Keep real enum values
vi.mock('@server/constants/work', async (importOriginal) => importOriginal());

vi.mock('@server/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/lib/permissions')>();
  return {
    ...actual,
    hasPermission: mockHasPermission,
    getManageRequestPermission: mockGetManageRequestPermission,
    getAutoApprovePermission: mockGetAutoApprovePermission,
  };
});

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

vi.mock('@server/entity/BookRequest', () => ({ BookRequest: MockBookRequest }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: MockMusicRequest }));
vi.mock('@server/entity/Work', () => ({ Work: MockWork }));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/Issue', () => ({ Issue: class Issue {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: class IssueComment {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class WorkAuthor {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class Edition {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class WorkAvailability {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/lib/metadataResolverInstance', () => ({
  getMetadataResolver: vi.fn(() => ({
    resolveWork: mockResolveWork,
  })),
}));

vi.mock('@server/lib/requestProcessor', () => ({
  processApprovedBookRequest: mockProcessApprovedBookRequest,
  processApprovedMusicRequest: mockProcessApprovedMusicRequest,
}));

vi.mock('@server/lib/quota', () => ({
  resolveEffectiveQuota: mockResolveEffectiveQuota,
  getQuotaUsage: mockGetQuotaUsage,
}));

vi.mock('@server/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/request');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 0, ...overrides };
}

function adminUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 2, ...overrides };
}

function defaultSettings(overrides: Record<string, any> = {}) {
  return {
    main: {
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      ...overrides,
    },
  };
}

function resetBookQb() {
  mockBookQb.leftJoinAndSelect.mockReturnValue(mockBookQb);
  mockBookQb.andWhere.mockReturnValue(mockBookQb);
  mockBookQb.orderBy.mockReturnValue(mockBookQb);
  mockBookQb.take.mockReturnValue(mockBookQb);
  mockBookQb.skip.mockReturnValue(mockBookQb);
  mockBookQb.getMany.mockResolvedValue([]);
  mockBookQb.getManyAndCount.mockResolvedValue([[], 0]);
  mockBookQb.getCount.mockResolvedValue(0);
  mockBookRequestRepo.createQueryBuilder.mockReturnValue(mockBookQb);
}

function resetMusicQb() {
  mockMusicQb.leftJoinAndSelect.mockReturnValue(mockMusicQb);
  mockMusicQb.andWhere.mockReturnValue(mockMusicQb);
  mockMusicQb.orderBy.mockReturnValue(mockMusicQb);
  mockMusicQb.take.mockReturnValue(mockMusicQb);
  mockMusicQb.skip.mockReturnValue(mockMusicQb);
  mockMusicQb.getManyAndCount.mockResolvedValue([[], 0]);
  mockMusicRequestRepo.createQueryBuilder.mockReturnValue(mockMusicQb);
}

function resetUpdateQb() {
  mockUpdateQb.leftJoin.mockReturnValue(mockUpdateQb);
  mockUpdateQb.where.mockReturnValue(mockUpdateQb);
  mockUpdateQb.andWhere.mockReturnValue(mockUpdateQb);
  mockUpdateQb.getCount.mockResolvedValue(0);
  mockUpdateQb.getOne.mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set chainable QB defaults after clearAllMocks
    resetBookQb();
    resetMusicQb();
    resetUpdateQb();
    mockHasPermission.mockReturnValue(false);
    mockGetManageRequestPermission.mockReturnValue(512);
    mockGetAutoApprovePermission.mockReturnValue(64);
    mockGetInstance.mockReturnValue(defaultSettings());
    mockBookRequestRepo.save.mockImplementation((data: any) => Promise.resolve(data));
    mockMusicRequestRepo.save.mockImplementation((data: any) => Promise.resolve(data));
    mockWorkRepo.save.mockImplementation((data: any) => Promise.resolve(data));
    mockProcessApprovedBookRequest.mockResolvedValue(undefined);
    mockProcessApprovedMusicRequest.mockResolvedValue(undefined);
  });

  // =========================================================================
  // GET /
  // =========================================================================

  describe('GET /', () => {
    const handler = handlers['GET /'];

    it('returns combined book + music results when no formatFilter', async () => {
      const bookResults = [{ id: 1, createdAt: '2025-01-02' }];
      const musicResults = [{ id: 2, createdAt: '2025-01-01' }];

      mockBookQb.getCount.mockResolvedValue(1);
      mockBookQb.getMany.mockResolvedValue(bookResults);
      mockMusicQb.getManyAndCount.mockResolvedValue([musicResults, 1]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: {} }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.pageInfo.results).toBe(2); // bookTotal + musicTotal
      expect(body.results).toHaveLength(2);
      // Both types present
      const types = body.results.map((r: any) => r.type);
      expect(types).toContain('book');
      expect(types).toContain('music');
    });

    it('returns book-only results when format=ebook', async () => {
      const bookResults = [{ id: 1, format: 'ebook' }];
      mockBookQb.getManyAndCount.mockResolvedValue([bookResults, 1]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: { format: 'ebook' } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.pageInfo.results).toBe(1);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].type).toBe('book');
      // Music QB should not have been created (format is ebook/audiobook)
      expect(mockMusicRequestRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns music-only results when format=music', async () => {
      const musicResults = [{ id: 10, album: { title: 'Album' } }];
      mockMusicQb.getManyAndCount.mockResolvedValue([musicResults, 1]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: { format: 'music' } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.pageInfo.results).toBe(1);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].type).toBe('music');
    });

    it('restricts to own requests when user lacks view permissions', async () => {
      mockHasPermission.mockReturnValue(false);
      mockBookQb.getCount.mockResolvedValue(0);
      mockBookQb.getMany.mockResolvedValue([]);
      mockMusicQb.getManyAndCount.mockResolvedValue([[], 0]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser({ id: 42 }), query: {} }), res);

      // Both book and music QBs should filter by userId
      const bookCalls = mockBookQb.andWhere.mock.calls;
      const musicCalls = mockMusicQb.andWhere.mock.calls;
      expect(bookCalls.some((c: any[]) => c[0] === 'requestedBy.id = :userId' && c[1]?.userId === 42)).toBe(true);
      expect(musicCalls.some((c: any[]) => c[0] === 'requestedBy.id = :userId' && c[1]?.userId === 42)).toBe(true);
    });

    it('filters by status when provided', async () => {
      mockBookQb.getCount.mockResolvedValue(0);
      mockBookQb.getMany.mockResolvedValue([]);
      mockMusicQb.getManyAndCount.mockResolvedValue([[], 0]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: { status: '1' } }), res);

      const bookCalls = mockBookQb.andWhere.mock.calls;
      expect(bookCalls.some((c: any[]) => c[0] === 'request.status = :status' && c[1]?.status === 1)).toBe(true);
    });

    it('sorts by allowed fields and defaults to createdAt DESC', async () => {
      mockBookQb.getCount.mockResolvedValue(0);
      mockBookQb.getMany.mockResolvedValue([]);
      mockMusicQb.getManyAndCount.mockResolvedValue([[], 0]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: {} }), res);

      expect(mockBookQb.orderBy).toHaveBeenCalledWith('request.createdAt', 'DESC');
    });

    it('falls back to createdAt for invalid sort field', async () => {
      mockBookQb.getCount.mockResolvedValue(0);
      mockBookQb.getMany.mockResolvedValue([]);
      mockMusicQb.getManyAndCount.mockResolvedValue([[], 0]);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser(), query: { sort: 'invalidField' } }), res);

      expect(mockBookQb.orderBy).toHaveBeenCalledWith('request.createdAt', 'DESC');
    });
  });

  // =========================================================================
  // GET /count
  // =========================================================================

  describe('GET /count', () => {
    const handler = handlers['GET /count'];

    it('returns counts by status', async () => {
      mockBookRequestRepo.count
        .mockResolvedValueOnce(3)   // pending
        .mockResolvedValueOnce(5)   // approved
        .mockResolvedValueOnce(1)   // declined
        .mockResolvedValueOnce(10)  // completed
        .mockResolvedValueOnce(2);  // failed

      const res = mockRes();
      await handler(mockReq({ user: defaultUser() }), res);

      expect(res.json).toHaveBeenCalledWith({
        pending: 3,
        approved: 5,
        declined: 1,
        completed: 10,
        failed: 2,
      });
    });

    it('restricts count to own when user lacks view permissions', async () => {
      mockHasPermission.mockReturnValue(false);
      mockBookRequestRepo.count.mockResolvedValue(0);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser({ id: 7 }) }), res);

      // Each count call should include requestedBy filter
      for (const call of mockBookRequestRepo.count.mock.calls) {
        expect(call[0].where).toHaveProperty('requestedBy');
        expect(call[0].where.requestedBy).toEqual({ id: 7 });
      }
    });

    it('does not restrict count when user has view permission', async () => {
      // ADMIN check false, REQUEST_VIEW_EBOOK true
      mockHasPermission.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockBookRequestRepo.count.mockResolvedValue(0);

      const res = mockRes();
      await handler(mockReq({ user: defaultUser({ permissions: 4096 }) }), res);

      // count calls should NOT have requestedBy filter
      for (const call of mockBookRequestRepo.count.mock.calls) {
        expect(call[0].where).not.toHaveProperty('requestedBy');
      }
    });
  });

  // =========================================================================
  // POST /
  // =========================================================================

  describe('POST /', () => {
    const handler = handlers['POST /'];

    it('400 when format is invalid', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { format: 'invalid' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'format must be "ebook" or "audiobook"' });
    });

    it('400 when format is missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: {}, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'format must be "ebook" or "audiobook"' });
    });

    it('403 when ebook requests are disabled', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ enableEbookRequests: false }));

      const res = mockRes();
      await handler(mockReq({ body: { format: 'ebook' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Ebook requests are currently disabled' });
    });

    it('403 when audiobook requests are disabled', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ enableAudiobookRequests: false }));

      const res = mockRes();
      await handler(mockReq({ body: { format: 'audiobook' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Audiobook requests are currently disabled' });
    });

    it('403 when user lacks request permission', async () => {
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'You do not have permission to request this format' });
    });

    it('400 when neither workId nor hardcoverId provided', async () => {
      mockHasPermission.mockReturnValue(true);

      const res = mockRes();
      await handler(mockReq({ body: { format: 'ebook' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'workId or hardcoverId is required' });
    });

    it('400 for invalid workId (not a positive integer)', async () => {
      mockHasPermission.mockReturnValue(true);

      const res = mockRes();
      await handler(mockReq({ body: { format: 'ebook', workId: -1 }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'workId must be a valid positive integer' });
    });

    it('400 for invalid hardcoverId (too long)', async () => {
      mockHasPermission.mockReturnValue(true);

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', hardcoverId: 'x'.repeat(101) }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'hardcoverId must be a non-empty string (max 100 characters)' });
    });

    it('400 for invalid requestedLanguage', async () => {
      mockHasPermission.mockReturnValue(true);

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', workId: 1, requestedLanguage: 'invalid!!!' }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('requestedLanguage must be a valid BCP 47 language tag') })
      );
    });

    it('404 when metadata cannot be resolved', async () => {
      mockHasPermission.mockReturnValue(true);
      mockWorkRepo.findOne.mockResolvedValue(null); // no existing work
      mockResolveWork.mockResolvedValue(null); // metadata resolution fails

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', hardcoverId: 'hc-unknown' }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Could not resolve work metadata for this ID' });
    });

    it('409 when duplicate pending request exists', async () => {
      mockHasPermission.mockReturnValue(true);

      // Transaction throws a 409 error
      mockTransaction.mockImplementation(async (_cb: (...args: any[]) => any) => {
        throw Object.assign(new Error('You already have a pending request for this work and format'), {
          statusCode: 409,
          existingRequestId: 99,
        });
      });

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'You already have a pending request for this work and format',
        existingRequestId: 99,
      });
    });

    it('409 when active approved/completed request exists', async () => {
      mockHasPermission.mockReturnValue(true);

      mockTransaction.mockImplementation(async () => {
        throw Object.assign(new Error('This work is already requested or available in this format'), {
          statusCode: 409,
        });
      });

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'This work is already requested or available in this format',
      });
    });

    it('201 on success with auto-approve when user has AUTO_APPROVE permission', async () => {
      // First hasPermission call: request permission check -> true
      // Second hasPermission call: auto-approve check -> true
      mockHasPermission.mockReturnValue(true);
      mockGetAutoApprovePermission.mockReturnValue(64);

      const savedRequest = { id: 10, status: 1, format: 'ebook', work: { id: 5 } };
      const work = { id: 5, status: 1 };

      mockTransaction.mockImplementation(async (_cb: (...args: any[]) => any) => {
        return { request: savedRequest, work };
      });

      // After auto-approve, the handler reloads the request
      const reloadedRequest = { id: 10, status: 2, format: 'ebook', work: { id: 5 }, requestedBy: { id: 1 } };
      mockBookRequestRepo.findOne.mockResolvedValue(reloadedRequest);

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(reloadedRequest);
      // Auto-approve should set status to APPROVED (2)
      expect(savedRequest.status).toBe(2);
      expect(mockBookRequestRepo.save).toHaveBeenCalled();
      expect(mockProcessApprovedBookRequest).toHaveBeenCalledWith(savedRequest);
    });

    it('201 on success without auto-approve', async () => {
      // First hasPermission: request permission -> true
      // After transaction: auto-approve check -> false
      mockHasPermission
        .mockReturnValueOnce(true)  // request permission check
        .mockReturnValueOnce(false); // auto-approve check

      const savedRequest = { id: 11, status: 1, format: 'ebook', work: { id: 6 } };
      const work = { id: 6, status: 2 };

      mockTransaction.mockImplementation(async (_cb: (...args: any[]) => any) => {
        return { request: savedRequest, work };
      });

      const reloadedRequest = { id: 11, status: 1, format: 'ebook', work: { id: 6 }, requestedBy: { id: 1 } };
      mockBookRequestRepo.findOne.mockResolvedValue(reloadedRequest);

      const res = mockRes();
      await handler(
        mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(reloadedRequest);
      // Should NOT have called processApprovedBookRequest
      expect(mockProcessApprovedBookRequest).not.toHaveBeenCalled();
      // Status should remain PENDING (1)
      expect(savedRequest.status).toBe(1);
    });

    it('re-throws errors without statusCode', async () => {
      mockHasPermission.mockReturnValue(true);

      const unexpectedError = new Error('Unexpected DB error');
      mockTransaction.mockRejectedValue(unexpectedError);

      await expect(
        handler(
          mockReq({ body: { format: 'ebook', workId: 1 }, user: defaultUser() }),
          mockRes()
        )
      ).rejects.toThrow('Unexpected DB error');
    });
  });

  // =========================================================================
  // GET /:id
  // =========================================================================

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns book request with type "book"', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 1 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      // hasPermission: ADMIN -> true (allows viewing)
      mockHasPermission.mockReturnValueOnce(true);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser() }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ type: 'book', id: 1 }));
    });

    it('falls back to music request with type "music"', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null); // no book request
      const musicRequest = {
        id: 2,
        status: 1,
        requestedBy: { id: 1 },
        album: { id: 20 },
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      // hasPermission: ADMIN -> true
      mockHasPermission.mockReturnValueOnce(true);

      const res = mockRes();
      await handler(mockReq({ params: { id: '2' }, user: defaultUser() }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ type: 'music', id: 2 }));
    });

    it('404 when neither book nor music request found', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      mockMusicRequestRepo.findOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: '999' }, user: defaultUser() }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('403 when user cannot view others\' book request', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 99 }, // different user
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      // All hasPermission calls return false (no ADMIN, no VIEW)
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('403 when user cannot view others\' music request', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null); // no book request
      const musicRequest = {
        id: 2,
        status: 1,
        requestedBy: { id: 99 }, // different user
        album: { id: 20 },
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      // All hasPermission calls return false
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('allows owner to view their own book request without view permission', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 42 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      mockHasPermission.mockReturnValue(false); // no permissions at all

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 42 }) }), res);

      // Should succeed — user is the owner
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ type: 'book', id: 1 }));
    });
  });

  // =========================================================================
  // PUT /:id
  // =========================================================================

  describe('PUT /:id', () => {
    const handler = handlers['PUT /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('400 when status is missing', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: {}, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'status is required' });
    });

    it('400 for invalid status value', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: { status: 999 }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid status value' });
    });

    it('400 for invalid declineReason (too long)', async () => {
      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, body: { status: 3, declineReason: 'x'.repeat(1001) }, user: defaultUser() }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'declineReason must be a string (max 1000 characters)' });
    });

    it('404 when neither book nor music request found', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      mockMusicRequestRepo.findOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: { status: 2 }, user: defaultUser() }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('403 when user lacks manage permission for book request', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 99 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, body: { status: 2 }, user: defaultUser() }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden — manage requests permission required' });
    });

    it('403 when user lacks manage permission for music request', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null); // no book request
      const musicRequest = {
        id: 2,
        status: 1,
        requestedBy: { id: 99 },
        album: { id: 20 },
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '2' }, body: { status: 2 }, user: defaultUser() }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden — manage requests permission required' });
    });

    it('updates book request and triggers processApprovedBookRequest on approve', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 99 },
        work: { id: 10 },
        modifiedBy: null as any,
        declineReason: undefined as any,
      };
      mockBookRequestRepo.findOne
        .mockResolvedValueOnce(bookRequest) // initial find
        .mockResolvedValueOnce({ ...bookRequest, status: 2, type: 'book' }); // reload
      mockHasPermission.mockReturnValue(true);

      const user = defaultUser({ id: 5 });
      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, body: { status: 2 }, user }),
        res
      );

      expect(bookRequest.status).toBe(2);
      expect(bookRequest.modifiedBy).toBe(user);
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith(bookRequest);
      expect(mockProcessApprovedBookRequest).toHaveBeenCalledWith(bookRequest);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ type: 'book' }));
    });

    it('updates music request and triggers processApprovedMusicRequest on approve', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null); // no book request
      const musicRequest = {
        id: 2,
        status: 1,
        requestedBy: { id: 99 },
        album: { id: 20 },
        modifiedBy: null as any,
        declineReason: undefined as any,
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      mockHasPermission.mockReturnValue(true);

      const user = defaultUser({ id: 5 });
      const res = mockRes();
      await handler(
        mockReq({ params: { id: '2' }, body: { status: 2 }, user }),
        res
      );

      expect(musicRequest.status).toBe(2);
      expect(musicRequest.modifiedBy).toBe(user);
      expect(mockMusicRequestRepo.save).toHaveBeenCalledWith(musicRequest);
      expect(mockProcessApprovedMusicRequest).toHaveBeenCalledWith(musicRequest);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ type: 'music' }));
    });

    it('sets declineReason on decline for book request', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 99 },
        work: { id: 10 },
        modifiedBy: null as any,
        declineReason: undefined as any,
      };
      mockBookRequestRepo.findOne
        .mockResolvedValueOnce(bookRequest)
        .mockResolvedValueOnce({ ...bookRequest, status: 3, declineReason: 'Not available' });
      mockHasPermission.mockReturnValue(true);

      // Use separate QB for updateWorkStatusAfterRequestChange
      mockBookRequestRepo.createQueryBuilder.mockReturnValueOnce(mockUpdateQb);
      mockUpdateQb.getCount.mockResolvedValue(0);
      mockWorkRepo.findOne.mockResolvedValue({ id: 10, status: 2 }); // PENDING

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, body: { status: 3, declineReason: 'Not available' }, user: defaultUser() }),
        res
      );

      expect(bookRequest.status).toBe(3);
      expect(bookRequest.declineReason).toBe('Not available');
      expect(mockProcessApprovedBookRequest).not.toHaveBeenCalled();
    });

    it('sets declineReason on decline for music request', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      const musicRequest = {
        id: 2,
        status: 1,
        requestedBy: { id: 99 },
        album: { id: 20 },
        modifiedBy: null as any,
        declineReason: undefined as any,
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      mockHasPermission.mockReturnValue(true);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '2' }, body: { status: 3, declineReason: 'Duplicate' }, user: defaultUser() }),
        res
      );

      expect(musicRequest.status).toBe(3);
      expect(musicRequest.declineReason).toBe('Duplicate');
      expect(mockProcessApprovedMusicRequest).not.toHaveBeenCalled();
    });

    it('calls updateWorkStatusAfterRequestChange on decline with book work', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        status: 1,
        requestedBy: { id: 99 },
        work: { id: 10 },
        modifiedBy: null as any,
        declineReason: undefined as any,
      };
      mockBookRequestRepo.findOne
        .mockResolvedValueOnce(bookRequest)
        .mockResolvedValueOnce({ ...bookRequest, status: 3 });
      mockHasPermission.mockReturnValue(true);

      // updateWorkStatusAfterRequestChange calls
      mockWorkRepo.findOne.mockResolvedValue({ id: 10, status: 2 }); // WorkStatus.PENDING
      // Use the update QB for the createQueryBuilder call inside updateWorkStatusAfterRequestChange
      mockBookRequestRepo.createQueryBuilder.mockReturnValueOnce(mockUpdateQb);
      mockUpdateQb.getCount.mockResolvedValue(0); // no active requests left

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, body: { status: 3 }, user: defaultUser() }),
        res
      );

      // Work should be reset to UNKNOWN (1) since no active requests
      expect(mockWorkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, status: 1 })
      );
    });
  });

  // =========================================================================
  // DELETE /:id
  // =========================================================================

  describe('DELETE /:id', () => {
    const handler = handlers['DELETE /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: defaultUser() }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('404 when neither book nor music request found', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      mockMusicRequestRepo.findOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser() }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('403 when not owner and not admin/manager for book request', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        requestedBy: { id: 99 }, // different user
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      // ADMIN false, manage permission false
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('403 when not owner and not admin/manager for music request', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      const musicRequest = {
        id: 2,
        requestedBy: { id: 99 }, // different user
        album: { id: 20 },
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      // ADMIN false, MANAGE_REQUESTS_MUSIC false
      mockHasPermission.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('deletes book request when user is owner', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        requestedBy: { id: 42 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      // hasPermission: ADMIN -> false (owner check is by user.id matching)
      mockHasPermission.mockReturnValue(false);

      // updateWorkStatusAfterRequestChange
      mockWorkRepo.findOne.mockResolvedValue({ id: 10, status: 2 }); // PENDING
      mockBookRequestRepo.createQueryBuilder.mockReturnValueOnce(mockUpdateQb);
      mockUpdateQb.getCount.mockResolvedValue(0);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 42 }) }), res);

      expect(mockBookRequestRepo.remove).toHaveBeenCalledWith(bookRequest);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('deletes music request when user is admin', async () => {
      mockBookRequestRepo.findOne.mockResolvedValue(null);
      const musicRequest = {
        id: 2,
        requestedBy: { id: 99 },
        album: { id: 20 },
      };
      mockMusicRequestRepo.findOne.mockResolvedValue(musicRequest);
      // ADMIN -> true
      mockHasPermission.mockReturnValueOnce(true);

      const res = mockRes();
      await handler(mockReq({ params: { id: '2' }, user: adminUser() }), res);

      expect(mockMusicRequestRepo.remove).toHaveBeenCalledWith(musicRequest);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('calls updateWorkStatusAfterRequestChange after book deletion', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        requestedBy: { id: 42 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      mockHasPermission.mockReturnValue(false); // owner check passes via id match

      // updateWorkStatusAfterRequestChange
      mockWorkRepo.findOne.mockResolvedValue({ id: 10, status: 2 }); // WorkStatus.PENDING
      mockBookRequestRepo.createQueryBuilder.mockReturnValueOnce(mockUpdateQb);
      mockUpdateQb.getCount.mockResolvedValue(0); // no active requests

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 42 }) }), res);

      // Work should be reset to UNKNOWN
      expect(mockWorkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, status: 1 })
      );
    });

    it('does not reset work status when active requests still exist', async () => {
      const bookRequest = {
        id: 1,
        format: 'ebook',
        requestedBy: { id: 42 },
        work: { id: 10 },
      };
      mockBookRequestRepo.findOne.mockResolvedValue(bookRequest);
      mockHasPermission.mockReturnValue(false);

      // updateWorkStatusAfterRequestChange
      mockWorkRepo.findOne.mockResolvedValue({ id: 10, status: 2 }); // PENDING
      mockBookRequestRepo.createQueryBuilder.mockReturnValueOnce(mockUpdateQb);
      mockUpdateQb.getCount.mockResolvedValue(2); // still 2 active requests

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: defaultUser({ id: 42 }) }), res);

      // Work save should NOT be called (status stays as is)
      expect(mockWorkRepo.save).not.toHaveBeenCalled();
    });
  });
});
