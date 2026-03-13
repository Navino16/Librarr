import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockHasPermission,
  mockCommentRepo,
  mockIssueRepo,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockHasPermission: vi.fn().mockReturnValue(false),
  mockCommentRepo: {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((data: any) => data),
    save: vi.fn((data: any) => data),
    remove: vi.fn(),
  },
  mockIssueRepo: {
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

// Sentinel classes for getRepository dispatch
class MockIssue {}
class MockIssueComment {}

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
      if (entity === MockIssue) return mockIssueRepo;
      return mockCommentRepo;
    }),
  },
}));

vi.mock('@server/entity/Issue', () => ({ Issue: MockIssue }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: MockIssueComment }));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/Work', () => ({ Work: class Work {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class BookRequest {} }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: class MusicRequest {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class WorkAuthor {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class Edition {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class WorkAvailability {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));

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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/issueComment');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/issueComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockCommentRepo.create.mockImplementation((data: any) => data);
    mockCommentRepo.save.mockImplementation((data: any) => data);
    mockHasPermission.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    const handler = handlers['POST /'];

    it('400 when issueId missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { message: 'hello' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when message missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid issueId (non-numeric)', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 'abc', message: 'hi' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'issueId must be a valid positive integer' });
    });

    it('400 for message > 5000 chars', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1, message: 'a'.repeat(5001) }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Message must be a string of at most 5000 characters' });
    });

    it('400 for non-string message', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1, message: 12345 }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Message must be a string of at most 5000 characters' });
    });

    it('404 when issue not found', async () => {
      mockIssueRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1, message: 'hello' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('403 when user is not creator and has no permission', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 1, createdBy: { id: 99 } });
      mockHasPermission.mockReturnValue(false);
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1, message: 'hello' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('201 for issue creator', async () => {
      mockIssueRepo.findOne.mockResolvedValue({ id: 1, createdBy: { id: 42 } });
      mockHasPermission.mockReturnValue(false);
      const user = { id: 42, permissions: 0 };
      const res = mockRes();
      await handler(mockReq({ body: { issueId: 1, message: 'hello' }, user }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCommentRepo.create).toHaveBeenCalled();
      expect(mockCommentRepo.save).toHaveBeenCalled();
    });

  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // -------------------------------------------------------------------------

  describe('DELETE /:id', () => {
    const handler = handlers['DELETE /:id'];

    it('404 when not found', async () => {
      mockCommentRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('403 for non-owner without MANAGE_ISSUES/ADMIN', async () => {
      mockCommentRepo.findOne.mockResolvedValue({ id: 1, user: { id: 99 } });
      mockHasPermission.mockReturnValue(false);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('success for owner', async () => {
      mockCommentRepo.findOne.mockResolvedValue({ id: 1, user: { id: 42 } });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 42, permissions: 0 } }), res);
      expect(mockCommentRepo.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('success for MANAGE_ISSUES user (not owner)', async () => {
      mockCommentRepo.findOne.mockResolvedValue({ id: 1, user: { id: 99 } });
      // hasPermission: ADMIN → false, MANAGE_ISSUES → true
      mockHasPermission.mockReturnValueOnce(false).mockReturnValueOnce(true);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 1, permissions: 131072 } }), res);
      expect(mockCommentRepo.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
