import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockHasPermission,
  mockIssueRepo,
  mockCommentRepo,
  mockWorkRepo,
  mockMusicAlbumRepo,
  mockQb,
} = vi.hoisted(() => {
  const mockQb: any = {};
  mockQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockQb);
  mockQb.orderBy = vi.fn().mockReturnValue(mockQb);
  mockQb.take = vi.fn().mockReturnValue(mockQb);
  mockQb.skip = vi.fn().mockReturnValue(mockQb);
  mockQb.andWhere = vi.fn().mockReturnValue(mockQb);
  mockQb.getManyAndCount = vi.fn().mockResolvedValue([[], 0]);

  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockHasPermission: vi.fn().mockReturnValue(false),
    mockIssueRepo: {
      createQueryBuilder: vi.fn().mockReturnValue(mockQb),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => data),
      findOne: vi.fn().mockResolvedValue(null),
      remove: vi.fn(),
    },
    mockCommentRepo: {
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => data),
    },
    mockWorkRepo: {
      findOne: vi.fn().mockResolvedValue(null),
    },
    mockMusicAlbumRepo: {
      findOne: vi.fn().mockResolvedValue(null),
    },
    mockQb,
  };
});

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
      if (entity === MockWork) return mockWorkRepo;
      if (entity === MockMusicAlbum) return mockMusicAlbumRepo;
      if (entity === MockIssueComment) return mockCommentRepo;
      return mockIssueRepo;
    }),
  },
}));

// Keep real enum values
vi.mock('@server/constants/issue', async (importOriginal) => importOriginal());

vi.mock('@server/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/lib/permissions')>();
  return {
    ...actual,
    hasPermission: mockHasPermission,
  };
});

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

// Sentinel classes for getRepository dispatch
class MockWork {}
class MockMusicAlbum {}
class MockIssueComment {}
vi.mock('@server/entity/Work', () => ({ Work: MockWork }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: MockMusicAlbum }));
vi.mock('@server/entity/Issue', () => ({ Issue: class Issue {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: MockIssueComment }));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class BookRequest {} }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: class MusicRequest {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class WorkAuthor {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class Edition {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class WorkAvailability {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/issue');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/issue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockQb.leftJoinAndSelect.mockReturnValue(mockQb);
    mockQb.orderBy.mockReturnValue(mockQb);
    mockQb.take.mockReturnValue(mockQb);
    mockQb.skip.mockReturnValue(mockQb);
    mockQb.andWhere.mockReturnValue(mockQb);
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);
    mockIssueRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockIssueRepo.create.mockImplementation((data: any) => ({ id: 1, ...data }));
    mockIssueRepo.save.mockImplementation((data: any) => data);
    mockCommentRepo.create.mockImplementation((data: any) => data);
    mockCommentRepo.save.mockImplementation((data: any) => data);
    mockHasPermission.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    const handler = handlers['GET /'];

    it('returns paginated issues with pageInfo', async () => {
      const issues = [{ id: 1 }, { id: 2 }];
      mockQb.getManyAndCount.mockResolvedValue([issues, 2]);

      const res = mockRes();
      await handler(mockReq({ user: { id: 1, permissions: 0 } }), res);

      expect(res.json).toHaveBeenCalledWith({
        pageInfo: { pages: 1, page: 1, results: 2 },
        results: issues,
      });
    });

    it('clamps take to max 100', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ user: { id: 1, permissions: 0 }, query: { take: '999' } }), res);

      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('filters by open status', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ user: { id: 1, permissions: 0 }, query: { filter: 'open' } }), res);

      expect(mockQb.andWhere).toHaveBeenCalledWith('issue.status = :status', { status: 1 });
    });

    it('filters by resolved status', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ user: { id: 1, permissions: 0 }, query: { filter: 'resolved' } }), res);

      expect(mockQb.andWhere).toHaveBeenCalledWith('issue.status = :status', { status: 2 });
    });

    it('restricts to own issues when user lacks permissions', async () => {
      mockHasPermission.mockReturnValue(false);
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ user: { id: 42, permissions: 0 } }), res);

      expect(mockQb.andWhere).toHaveBeenCalledWith('createdBy.id = :userId', { userId: 42 });
    });

    it('does not restrict when user has VIEW_ISSUES', async () => {
      // Third call to hasPermission (VIEW_ISSUES) returns true
      mockHasPermission.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ user: { id: 42, permissions: 65536 } }), res);

      // andWhere should not be called with createdBy filter
      const calls = mockQb.andWhere.mock.calls;
      const hasUserFilter = calls.some((c: any[]) => c[0] === 'createdBy.id = :userId');
      expect(hasUserFilter).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // GET /count
  // -------------------------------------------------------------------------

  describe('GET /count', () => {
    const handler = handlers['GET /count'];

    it('returns open, resolved and total counts', async () => {
      mockIssueRepo.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({ open: 5, resolved: 3, total: 8 });
    });
  });

  // -------------------------------------------------------------------------
  // GET /count/work/:id
  // -------------------------------------------------------------------------

  describe('GET /count/work/:id', () => {
    const handler = handlers['GET /count/work/:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns open count for a work', async () => {
      mockIssueRepo.count.mockResolvedValue(3);
      const res = mockRes();
      await handler(mockReq({ params: { id: '10' } }), res);
      expect(mockIssueRepo.count).toHaveBeenCalledWith({
        where: { work: { id: 10 }, status: 1 },
      });
      expect(res.json).toHaveBeenCalledWith({ open: 3 });
    });
  });

  // -------------------------------------------------------------------------
  // GET /count/music/:id
  // -------------------------------------------------------------------------

  describe('GET /count/music/:id', () => {
    const handler = handlers['GET /count/music/:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns open count for a music album', async () => {
      mockIssueRepo.count.mockResolvedValue(1);
      const res = mockRes();
      await handler(mockReq({ params: { id: '5' } }), res);
      expect(mockIssueRepo.count).toHaveBeenCalledWith({
        where: { musicAlbum: { id: 5 }, status: 1 },
      });
      expect(res.json).toHaveBeenCalledWith({ open: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    const handler = handlers['POST /'];

    it('400 when neither workId nor musicAlbumId provided', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { issueType: 1 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when issueType missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { workId: 1 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid issueType', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { workId: 1, issueType: 99 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid issue type' });
    });

    it('404 when work not found', async () => {
      mockWorkRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ body: { workId: 1, issueType: 1 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('201 with created issue for work', async () => {
      mockWorkRepo.findOne.mockResolvedValue({ id: 1, title: 'Test Work' });
      const res = mockRes();
      const user = { id: 1, name: 'admin' };
      await handler(mockReq({ body: { workId: 1, issueType: 1 }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockIssueRepo.create).toHaveBeenCalled();
      expect(mockIssueRepo.save).toHaveBeenCalled();
    });

    it('404 when music album not found', async () => {
      mockMusicAlbumRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ body: { musicAlbumId: 1, issueType: 2 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Music album not found' });
    });

    it('201 with created issue for music album', async () => {
      mockMusicAlbumRepo.findOne.mockResolvedValue({ id: 5, title: 'Test Album' });
      const res = mockRes();
      const user = { id: 1, name: 'admin' };
      await handler(mockReq({ body: { musicAlbumId: 5, issueType: 2 }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ musicAlbum: { id: 5, title: 'Test Album' } })
      );
      expect(mockIssueRepo.save).toHaveBeenCalled();
    });

    it('creates initial comment when message provided', async () => {
      mockWorkRepo.findOne.mockResolvedValue({ id: 1, title: 'Test Work' });
      const res = mockRes();
      const user = { id: 1, name: 'admin' };
      await handler(mockReq({ body: { workId: 1, issueType: 1, message: '  Audio is out of sync  ' }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCommentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Audio is out of sync' })
      );
      expect(mockCommentRepo.save).toHaveBeenCalled();
    });

    it('does not create comment when message is empty', async () => {
      mockWorkRepo.findOne.mockResolvedValue({ id: 1, title: 'Test Work' });
      const res = mockRes();
      const user = { id: 1, name: 'admin' };
      await handler(mockReq({ body: { workId: 1, issueType: 1, message: '   ' }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCommentRepo.create).not.toHaveBeenCalled();
    });

    it('prefers workId when both workId and musicAlbumId provided', async () => {
      mockWorkRepo.findOne.mockResolvedValue({ id: 1, title: 'Test Work' });
      const res = mockRes();
      const user = { id: 1, name: 'admin' };
      await handler(mockReq({ body: { workId: 1, musicAlbumId: 5, issueType: 1 }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ work: { id: 1, title: 'Test Work' } })
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when not found', async () => {
      mockIssueRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('403 when non-privileged user views other\'s issue', async () => {
      mockHasPermission.mockReturnValue(false);
      mockIssueRepo.findOne.mockResolvedValue({ id: 1, createdBy: { id: 99 } });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns issue for privileged user', async () => {
      const issue = { id: 1, createdBy: { id: 99 } };
      // First hasPermission call (ADMIN) returns true
      mockHasPermission.mockReturnValueOnce(true);
      mockIssueRepo.findOne.mockResolvedValue(issue);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 2 } }), res);
      expect(res.json).toHaveBeenCalledWith(issue);
    });

    it('returns issue for creator (own issue)', async () => {
      mockHasPermission.mockReturnValue(false);
      mockIssueRepo.findOne.mockResolvedValue({ id: 1, createdBy: { id: 42 } });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 42, permissions: 0 } }), res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, createdBy: { id: 42 } });
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id
  // -------------------------------------------------------------------------

  describe('PUT /:id', () => {
    const handler = handlers['PUT /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when not found', async () => {
      mockIssueRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('updates valid status and sets modifiedBy', async () => {
      const issue = { id: 1, status: 1 };
      mockIssueRepo.findOne.mockResolvedValue(issue);
      const user = { id: 1, name: 'admin' };
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: { status: 2 }, user }), res);

      expect(issue.status).toBe(2);
      expect(mockIssueRepo.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
    });

    it('400 for invalid status value', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 1, status: 1 });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: { status: 999 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid status value' });
    });

    it('saves without change when no status in body', async () => {
      const issue = { id: 1, status: 1 };
      mockIssueRepo.findOne.mockResolvedValue(issue);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, body: {}, user: { id: 1 } }), res);

      expect(issue.status).toBe(1);
      expect(mockIssueRepo.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(issue);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // -------------------------------------------------------------------------

  describe('DELETE /:id', () => {
    const handler = handlers['DELETE /:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when not found', async () => {
      mockIssueRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('removes and returns success', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 1 });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1 } }), res);
      expect(mockIssueRepo.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
