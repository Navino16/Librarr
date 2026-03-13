import { Router, Request, Response } from 'express';
import dataSource from '../datasource';
import { Issue } from '../entity/Issue';
import { IssueComment } from '../entity/IssueComment';
import { Work } from '../entity/Work';
import { MusicAlbum } from '../entity/MusicAlbum';
import { IssueStatus, IssueType } from '../constants/issue';
import { Permission, hasPermission } from '../lib/permissions';
import { isAuthenticated, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param, parseId, safeInt } from '../utils/params';
import { notifyEvent } from '../lib/notifications/router';
import { NotificationType } from '../lib/notifications';

const router = Router();

// GET /issue - List issues
router.get('/', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const issueRepository = dataSource.getRepository(Issue);
  const take = Math.min(safeInt(req.query.take as string, 20), 100);
  const skip = safeInt(req.query.skip as string, 0);
  const filter = req.query.filter as string;

  const query = issueRepository
    .createQueryBuilder('issue')
    .leftJoinAndSelect('issue.work', 'work')
    .leftJoinAndSelect('issue.musicAlbum', 'musicAlbum')
    .leftJoinAndSelect('issue.createdBy', 'createdBy')
    .leftJoinAndSelect('issue.modifiedBy', 'modifiedBy')
    .orderBy('issue.createdAt', 'DESC')
    .take(take)
    .skip(skip);

  if (filter === 'open') {
    query.andWhere('issue.status = :status', { status: IssueStatus.OPEN });
  } else if (filter === 'resolved') {
    query.andWhere('issue.status = :status', { status: IssueStatus.RESOLVED });
  }

  // Non-admins with VIEW_ISSUES can see all, otherwise only own
  if (
    !hasPermission(req.user!.permissions, Permission.ADMIN) &&
    !hasPermission(req.user!.permissions, Permission.MANAGE_ISSUES) &&
    !hasPermission(req.user!.permissions, Permission.VIEW_ISSUES)
  ) {
    query.andWhere('createdBy.id = :userId', { userId: req.user!.id });
  }

  const [results, total] = await query.getManyAndCount();

  return res.json({
    pageInfo: { pages: Math.ceil(total / take), page: Math.floor(skip / take) + 1, results: total },
    results,
  });
}));

// GET /issue/count
router.get('/count', isAuthenticated, requirePermission(Permission.VIEW_ISSUES), asyncHandler(async (_req: Request, res: Response) => {
  const issueRepository = dataSource.getRepository(Issue);

  const open = await issueRepository.count({
    where: { status: IssueStatus.OPEN },
  });
  const resolved = await issueRepository.count({
    where: { status: IssueStatus.RESOLVED },
  });

  return res.json({ open, resolved, total: open + resolved });
}));

// GET /issue/count/work/:id - Open issue count for a work
router.get('/count/work/:id', isAuthenticated, requirePermission(Permission.VIEW_ISSUES), asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const issueRepository = dataSource.getRepository(Issue);
  const open = await issueRepository.count({
    where: { work: { id }, status: IssueStatus.OPEN },
  });
  return res.json({ open });
}));

// GET /issue/count/music/:id - Open issue count for a music album
router.get('/count/music/:id', isAuthenticated, requirePermission(Permission.VIEW_ISSUES), asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const issueRepository = dataSource.getRepository(Issue);
  const open = await issueRepository.count({
    where: { musicAlbum: { id }, status: IssueStatus.OPEN },
  });
  return res.json({ open });
}));

// POST /issue - Create issue
router.post(
  '/',
  isAuthenticated,
  requirePermission(Permission.CREATE_ISSUES),
  asyncHandler(async (req: Request, res: Response) => {
    const { workId, musicAlbumId, issueType, message } = req.body;

    if (!issueType || (!workId && !musicAlbumId)) {
      return res.status(400).json({ error: 'issueType and either workId or musicAlbumId are required' });
    }

    const validIssueTypes = Object.values(IssueType).filter((v) => typeof v === 'number');
    if (!validIssueTypes.includes(issueType)) {
      return res.status(400).json({ error: 'Invalid issue type' });
    }

    const issueData: Partial<Issue> = {
      issueType,
      status: IssueStatus.OPEN,
      createdBy: req.user!,
    };

    if (workId) {
      const workRepository = dataSource.getRepository(Work);
      const work = await workRepository.findOne({ where: { id: workId } });
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }
      issueData.work = work;
    } else {
      const musicAlbumRepository = dataSource.getRepository(MusicAlbum);
      const musicAlbum = await musicAlbumRepository.findOne({ where: { id: musicAlbumId } });
      if (!musicAlbum) {
        return res.status(404).json({ error: 'Music album not found' });
      }
      issueData.musicAlbum = musicAlbum;
    }

    const issueRepository = dataSource.getRepository(Issue);
    const issue = issueRepository.create(issueData);

    await issueRepository.save(issue);

    if (typeof message === 'string' && message.trim()) {
      const commentRepository = dataSource.getRepository(IssueComment);
      const comment = commentRepository.create({
        issue: { id: issue.id } as Issue,
        user: req.user!,
        message: message.trim().slice(0, 2000),
      });
      await commentRepository.save(comment);
    }

    const mediaTitle =
      issueData.work?.title || issueData.musicAlbum?.title || 'Unknown';
    notifyEvent(
      {
        notificationType: NotificationType.ISSUE_CREATED,
        subject: `New Issue: ${mediaTitle}`,
        message: `${req.user!.username} reported an issue on "${mediaTitle}".`,
        issue: {
          reportedBy: req.user!.username,
          reportedById: req.user!.id,
          issueId: issue.id,
          issueType: String(issueType),
        },
      },
      [req.user!.id]
    ).catch(() => {});

    return res.status(201).json(issue);
  })
);

// GET /issue/:id
router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const issueRepository = dataSource.getRepository(Issue);
  const id = parseId(param(req.params.id));
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const issue = await issueRepository.findOne({
    where: { id },
    relations: ['work', 'musicAlbum', 'createdBy', 'modifiedBy', 'comments', 'comments.user'],
  });

  if (!issue) {
    return res.status(404).json({ error: 'Issue not found' });
  }

  if (
    !hasPermission(req.user!.permissions, Permission.ADMIN) &&
    !hasPermission(req.user!.permissions, Permission.MANAGE_ISSUES) &&
    !hasPermission(req.user!.permissions, Permission.VIEW_ISSUES) &&
    issue.createdBy?.id !== req.user!.id
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json(issue);
}));

// PUT /issue/:id - Update issue (resolve/reopen)
router.put(
  '/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_ISSUES),
  asyncHandler(async (req: Request, res: Response) => {
    const issueRepository = dataSource.getRepository(Issue);
    const id = parseId(param(req.params.id));
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const issue = await issueRepository.findOne({
      where: { id },
      relations: ['createdBy', 'work', 'musicAlbum'],
    });

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const { status } = req.body;
    const validStatuses = Object.values(IssueStatus).filter((v) => typeof v === 'number');
    if (status && validStatuses.includes(status)) {
      issue.status = status;
      issue.modifiedBy = req.user!;
    } else if (status) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    await issueRepository.save(issue);

    // Notification for resolve/reopen
    if (status === IssueStatus.RESOLVED || status === IssueStatus.OPEN) {
      const isResolved = status === IssueStatus.RESOLVED;
      const mediaTitle =
        issue.work?.title || issue.musicAlbum?.title || 'Unknown';
      notifyEvent(
        {
          notificationType: isResolved
            ? NotificationType.ISSUE_RESOLVED
            : NotificationType.ISSUE_REOPENED,
          subject: `Issue ${isResolved ? 'Resolved' : 'Reopened'}: ${mediaTitle}`,
          message: `${req.user!.username} ${isResolved ? 'resolved' : 'reopened'} an issue on "${mediaTitle}".`,
          issue: {
            reportedBy: issue.createdBy?.username || 'Unknown',
            reportedById: issue.createdBy?.id,
            issueId: issue.id,
            issueType: String(issue.issueType),
          },
        },
        [req.user!.id]
      ).catch(() => {});
    }

    return res.json(issue);
  })
);

// DELETE /issue/:id
router.delete(
  '/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_ISSUES),
  asyncHandler(async (req: Request, res: Response) => {
    const issueRepository = dataSource.getRepository(Issue);
    const id = parseId(param(req.params.id));
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const issue = await issueRepository.findOne({
      where: { id },
    });

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    await issueRepository.remove(issue);
    return res.json({ success: true });
  })
);

export default router;
