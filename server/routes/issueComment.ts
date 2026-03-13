import { Router, Request, Response } from 'express';
import dataSource from '../datasource';
import { IssueComment } from '../entity/IssueComment';
import { Issue } from '../entity/Issue';
import { Permission, hasPermission } from '../lib/permissions';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param, parseId } from '../utils/params';
import { notifyEvent } from '../lib/notifications/router';
import { NotificationType } from '../lib/notifications';

const router = Router();

// POST /issueComment - Create comment
// Allowed for: MANAGE_ISSUES, ADMIN, or the issue creator
router.post('/', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const { issueId, message } = req.body;

  if (!issueId || !message) {
    return res.status(400).json({ error: 'issueId and message are required' });
  }

  const parsedIssueId = parseId(String(issueId));
  if (parsedIssueId === null) {
    return res.status(400).json({ error: 'issueId must be a valid positive integer' });
  }

  if (typeof message !== 'string' || message.length > 5000) {
    return res.status(400).json({ error: 'Message must be a string of at most 5000 characters' });
  }

  const issueRepository = dataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parsedIssueId },
    relations: ['createdBy', 'work', 'musicAlbum'],
  });

  if (!issue) {
    return res.status(404).json({ error: 'Issue not found' });
  }

  const isCreator = issue.createdBy?.id === req.user!.id;
  const canComment =
    isCreator ||
    hasPermission(req.user!.permissions, Permission.ADMIN) ||
    hasPermission(req.user!.permissions, Permission.MANAGE_ISSUES);

  if (!canComment) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const commentRepository = dataSource.getRepository(IssueComment);
  const comment = commentRepository.create({
    issue: { id: parsedIssueId } as Issue,
    user: req.user!,
    message,
  });

  await commentRepository.save(comment);

  // Notify about new comment
  const mediaTitle =
    issue.work?.title || issue.musicAlbum?.title || 'Unknown';
  notifyEvent(
    {
      notificationType: NotificationType.ISSUE_COMMENT,
      subject: `New Comment on Issue: ${mediaTitle}`,
      message: `${req.user!.username} commented on an issue for "${mediaTitle}".`,
      issue: {
        reportedBy: issue.createdBy?.username || 'Unknown',
        reportedById: issue.createdBy?.id,
        issueId: issue.id,
        issueType: String(issue.issueType),
      },
    },
    [req.user!.id]
  ).catch(() => {});

  return res.status(201).json(comment);
}));

// DELETE /issueComment/:id
router.delete('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const commentRepository = dataSource.getRepository(IssueComment);
  const comment = await commentRepository.findOne({
    where: { id: parseId(param(req.params.id)) ?? 0 },
    relations: ['user'],
  });

  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  if (
    comment.user.id !== req.user!.id &&
    !hasPermission(req.user!.permissions, Permission.ADMIN) &&
    !hasPermission(req.user!.permissions, Permission.MANAGE_ISSUES)
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await commentRepository.remove(comment);
  return res.json({ success: true });
}));

export default router;
