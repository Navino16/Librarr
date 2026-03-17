import dataSource from '../../datasource';
import { User } from '../../entity/User';
import { UserSettings } from '../../entity/UserSettings';
import { Permission, getAllowedNotificationTypes } from '../permissions';
import notificationManager, { NotificationPayload, NotificationType } from './index';
import logger from '../../logger';

/**
 * Resolve which users should receive a notification based on event type.
 */
/**
 * Determine which permission bit to check for manage-requests notifications.
 */
function getManagePermissionForFormat(format?: string): number {
  if (format === 'audiobook') return Permission.MANAGE_REQUESTS_AUDIOBOOK;
  if (format === 'music') return Permission.MANAGE_REQUESTS_MUSIC;
  return Permission.MANAGE_REQUESTS_EBOOK;
}

async function resolveTargetUsers(
  payload: NotificationPayload,
  excludeUserIds: number[] = []
): Promise<User[]> {
  const userRepo = dataSource.getRepository(User);
  const type = payload.notificationType;

  // For events targeting a single known user, fetch only that user
  if (
    type === NotificationType.MEDIA_APPROVED ||
    type === NotificationType.MEDIA_DECLINED ||
    type === NotificationType.MEDIA_AVAILABLE
  ) {
    const targetId = payload.request?.requestedById;
    if (!targetId || excludeUserIds.includes(targetId)) return [];
    const user = await userRepo.findOne({ where: { id: targetId } });
    return user ? [user] : [];
  }

  // For events targeting managers (by permission bit), use bitwise SQL filter
  const excluded = new Set(excludeUserIds);
  const permBit = getManagePermissionForFormat(payload.media?.format);

  switch (type) {
    case NotificationType.MEDIA_PENDING:
    case NotificationType.MEDIA_AUTO_APPROVED: {
      const users = await userRepo
        .createQueryBuilder('user')
        .where('(user.permissions & :perm) > 0', { perm: permBit })
        .getMany();
      return users.filter((u) => !excluded.has(u.id));
    }

    case NotificationType.MEDIA_FAILED: {
      // Requesting user + managers
      const managers = await userRepo
        .createQueryBuilder('user')
        .where('(user.permissions & :perm) > 0', { perm: permBit })
        .getMany();
      const result = managers.filter((u) => !excluded.has(u.id));
      const requesterId = payload.request?.requestedById;
      if (requesterId && !excluded.has(requesterId) && !result.some((u) => u.id === requesterId)) {
        const requester = await userRepo.findOne({ where: { id: requesterId } });
        if (requester) result.push(requester);
      }
      return result;
    }

    case NotificationType.ISSUE_CREATED: {
      const users = await userRepo
        .createQueryBuilder('user')
        .where('(user.permissions & :perm) > 0', { perm: Permission.MANAGE_ISSUES })
        .getMany();
      return users.filter((u) => !excluded.has(u.id));
    }

    case NotificationType.ISSUE_RESOLVED:
    case NotificationType.ISSUE_REOPENED:
    case NotificationType.ISSUE_COMMENT: {
      const managers = await userRepo
        .createQueryBuilder('user')
        .where('(user.permissions & :perm) > 0', { perm: Permission.MANAGE_ISSUES })
        .getMany();
      const result = managers.filter((u) => !excluded.has(u.id));
      const reporterId = payload.issue?.reportedById;
      if (reporterId && !excluded.has(reporterId) && !result.some((u) => u.id === reporterId)) {
        const reporter = await userRepo.findOne({ where: { id: reporterId } });
        if (reporter) result.push(reporter);
      }
      return result;
    }

    default:
      return [];
  }
}

/**
 * Main entry point for dispatching notifications.
 * Sends to global agents and all registered per-user agents.
 */
export async function notifyEvent(
  payload: NotificationPayload,
  excludeUserIds: number[] = []
): Promise<void> {
  // 1. Global agents (Discord, Webhook)
  notificationManager.sendNotification(payload).catch((e) => {
    logger.error('Global notification dispatch failed', { error: e });
  });

  // 2. Per-user agents (email, pushbullet, pushover, telegram, etc.)
  const userAgents = notificationManager.getUserAgents();
  if (userAgents.length === 0) return;

  try {
    const targetUsers = await resolveTargetUsers(payload, excludeUserIds);
    if (targetUsers.length === 0) return;

    const settingsRepo = dataSource.getRepository(UserSettings);

    for (const user of targetUsers) {
      try {
        const userSettings = await settingsRepo.findOne({
          where: { user: { id: user.id } },
        });

        if (!userSettings) continue;

        // Check if user has this notification type enabled AND still has permission for it
        const effectiveTypes = userSettings.notificationTypes & getAllowedNotificationTypes(user.permissions);
        if (!(effectiveTypes & payload.notificationType)) continue;

        for (const agent of userAgents) {
          agent.sendToUser(payload, user, userSettings).catch((e) => {
            logger.error(`Per-user ${agent.id} notification failed`, {
              userId: user.id,
              error: e,
            });
          });
        }
      } catch (e) {
        logger.error('Error processing user notification', {
          userId: user.id,
          error: e,
        });
      }
    }
  } catch (e) {
    logger.error('Per-user notification dispatch failed', { error: e });
  }
}
