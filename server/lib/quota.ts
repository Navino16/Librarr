import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { MusicRequest } from '../entity/MusicRequest';
import { User } from '../entity/User';
import { Permission, hasPermission } from './permissions';
import Settings from './settings';
import { MoreThanOrEqual } from 'typeorm';

export const QUOTA_WINDOW_DAYS = 7;

export interface QuotaInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
}

/**
 * Resolve the effective quota limit for a user.
 * Priority: user-specific override > role default > null (unlimited).
 * Returns null for ADMIN or BYPASS_QUOTA users.
 */
export function resolveEffectiveQuota(
  user: User,
  type: 'ebook' | 'audiobook' | 'music'
): number | null {
  if (hasPermission(user.permissions, Permission.ADMIN)) return null;
  if (hasPermission(user.permissions, Permission.BYPASS_QUOTA)) return null;

  // User-specific override
  const userLimit =
    type === 'ebook'
      ? user.ebookQuotaLimit
      : type === 'audiobook'
        ? user.audiobookQuotaLimit
        : user.musicQuotaLimit;
  if (userLimit != null) return userLimit;

  // Role default: find the matching role by permissions
  const settings = Settings.getInstance();
  const role = settings.roles.find((r) => r.permissions === user.permissions);
  if (role) {
    const roleLimit =
      type === 'ebook'
        ? role.ebookQuotaLimit
        : type === 'audiobook'
          ? role.audiobookQuotaLimit
          : role.musicQuotaLimit;
    if (roleLimit != null) return roleLimit;
  }

  return null; // unlimited
}

/**
 * Count requests created by a user within the sliding window.
 * For ebook/audiobook, filters by format on BookRequest.
 * For music, counts MusicRequest.
 * All statuses count.
 */
export async function getQuotaUsage(
  userId: number,
  type: 'ebook' | 'audiobook' | 'music'
): Promise<number> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - QUOTA_WINDOW_DAYS);

  if (type === 'ebook' || type === 'audiobook') {
    return dataSource.getRepository(BookRequest).count({
      where: {
        requestedBy: { id: userId },
        format: type,
        createdAt: MoreThanOrEqual(windowStart),
      },
    });
  }

  return dataSource.getRepository(MusicRequest).count({
    where: {
      requestedBy: { id: userId },
      createdAt: MoreThanOrEqual(windowStart),
    },
  });
}
