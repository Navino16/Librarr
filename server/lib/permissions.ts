export enum Permission {
  NONE = 0,
  ADMIN = 2,
  MANAGE_USERS = 4,

  // Request - create
  REQUEST_EBOOK = 8,
  REQUEST_AUDIOBOOK = 16,
  REQUEST_MUSIC = 32,

  // Request - auto approve
  AUTO_APPROVE_EBOOK = 64,
  AUTO_APPROVE_AUDIOBOOK = 128,
  AUTO_APPROVE_MUSIC = 256,

  // Request - manage (approve/decline)
  MANAGE_REQUESTS_EBOOK = 512,
  MANAGE_REQUESTS_AUDIOBOOK = 1024,
  MANAGE_REQUESTS_MUSIC = 2048,

  // Request - view all (not just own)
  REQUEST_VIEW_EBOOK = 4096,
  REQUEST_VIEW_AUDIOBOOK = 8192,
  REQUEST_VIEW_MUSIC = 16384,

  // Issues
  CREATE_ISSUES = 32768,
  VIEW_ISSUES = 65536,
  MANAGE_ISSUES = 131072,

  // Settings
  MANAGE_SETTINGS_GENERAL = 262144,
  MANAGE_SETTINGS_PERMISSIONS = 524288,
  MANAGE_SETTINGS_READARR = 1048576,
  MANAGE_SETTINGS_LIDARR = 2097152,
  MANAGE_SETTINGS_MEDIA_SERVERS = 4194304,
  MANAGE_SETTINGS_NOTIFICATIONS = 8388608,
  MANAGE_SETTINGS_JOBS = 16777216,
  MANAGE_SETTINGS_METADATA = 33554432,

  // Quotas
  BYPASS_QUOTA = 67108864,
}

export const DefaultRoles = {
  ADMIN: Permission.ADMIN,
  MANAGER:
    Permission.MANAGE_USERS |
    Permission.REQUEST_EBOOK |
    Permission.REQUEST_AUDIOBOOK |
    Permission.REQUEST_MUSIC |
    Permission.MANAGE_REQUESTS_EBOOK |
    Permission.MANAGE_REQUESTS_AUDIOBOOK |
    Permission.MANAGE_REQUESTS_MUSIC |
    Permission.REQUEST_VIEW_EBOOK |
    Permission.REQUEST_VIEW_AUDIOBOOK |
    Permission.REQUEST_VIEW_MUSIC |
    Permission.CREATE_ISSUES |
    Permission.MANAGE_ISSUES |
    Permission.VIEW_ISSUES |
    Permission.BYPASS_QUOTA,
  USER:
    Permission.REQUEST_EBOOK |
    Permission.REQUEST_AUDIOBOOK |
    Permission.REQUEST_MUSIC |
    Permission.CREATE_ISSUES |
    Permission.VIEW_ISSUES,
};

export function hasPermission(
  userPermissions: number,
  requiredPermission: Permission
): boolean {
  if (userPermissions & Permission.ADMIN) {
    return true;
  }
  return (userPermissions & requiredPermission) === requiredPermission;
}

export function canRequestAny(permissions: number): boolean {
  return !!(
    permissions & Permission.ADMIN ||
    permissions & Permission.REQUEST_EBOOK ||
    permissions & Permission.REQUEST_AUDIOBOOK ||
    permissions & Permission.REQUEST_MUSIC
  );
}

export function canManageRequestsAny(permissions: number): boolean {
  return !!(
    permissions & Permission.ADMIN ||
    permissions & Permission.MANAGE_REQUESTS_EBOOK ||
    permissions & Permission.MANAGE_REQUESTS_AUDIOBOOK ||
    permissions & Permission.MANAGE_REQUESTS_MUSIC
  );
}

export function canViewRequestsAny(permissions: number): boolean {
  return !!(
    permissions & Permission.ADMIN ||
    permissions & Permission.REQUEST_VIEW_EBOOK ||
    permissions & Permission.REQUEST_VIEW_AUDIOBOOK ||
    permissions & Permission.REQUEST_VIEW_MUSIC
  );
}

export function canAccessSettings(permissions: number): boolean {
  return !!(
    permissions & Permission.ADMIN ||
    permissions & Permission.MANAGE_SETTINGS_GENERAL ||
    permissions & Permission.MANAGE_SETTINGS_PERMISSIONS ||
    permissions & Permission.MANAGE_SETTINGS_READARR ||
    permissions & Permission.MANAGE_SETTINGS_LIDARR ||
    permissions & Permission.MANAGE_SETTINGS_MEDIA_SERVERS ||
    permissions & Permission.MANAGE_SETTINGS_NOTIFICATIONS ||
    permissions & Permission.MANAGE_SETTINGS_JOBS ||
    permissions & Permission.MANAGE_SETTINGS_METADATA
  );
}

/**
 * Compute the bitmask of notification types a user is allowed to enable,
 * based on their current permissions.
 */
export function getAllowedNotificationTypes(permissions: number): number {
  // Admin can receive all notification types
  if (permissions & Permission.ADMIN) return 0x7ff;

  let allowed = 0;

  const canRequest = !!(
    permissions &
    (Permission.REQUEST_EBOOK | Permission.REQUEST_AUDIOBOOK | Permission.REQUEST_MUSIC)
  );
  const canManageRequests = !!(
    permissions &
    (Permission.MANAGE_REQUESTS_EBOOK | Permission.MANAGE_REQUESTS_AUDIOBOOK | Permission.MANAGE_REQUESTS_MUSIC)
  );
  const hasIssueAccess = !!(
    permissions &
    (Permission.CREATE_ISSUES | Permission.VIEW_ISSUES | Permission.MANAGE_ISSUES)
  );
  const canManageIssues = !!(permissions & Permission.MANAGE_ISSUES);

  // Request notifications
  if (canManageRequests) {
    allowed |= 1;  // MEDIA_PENDING
    allowed |= 32; // MEDIA_AUTO_APPROVED
  }
  if (canRequest || canManageRequests) {
    allowed |= 2;  // MEDIA_APPROVED
    allowed |= 4;  // MEDIA_AVAILABLE
    allowed |= 8;  // MEDIA_FAILED
    allowed |= 16; // MEDIA_DECLINED
  }

  // Issue notifications
  if (canManageIssues) allowed |= 64; // ISSUE_CREATED
  if (hasIssueAccess) {
    allowed |= 128; // ISSUE_COMMENT
    allowed |= 256; // ISSUE_RESOLVED
    allowed |= 512; // ISSUE_REOPENED
  }

  return allowed;
}

export function getRequestPermission(
  type: string,
  format?: string
): Permission {
  if (type === 'music') return Permission.REQUEST_MUSIC;
  if (format === 'audiobook') return Permission.REQUEST_AUDIOBOOK;
  return Permission.REQUEST_EBOOK;
}

export function getAutoApprovePermission(
  type: string,
  format?: string
): Permission {
  if (type === 'music') return Permission.AUTO_APPROVE_MUSIC;
  if (format === 'audiobook') return Permission.AUTO_APPROVE_AUDIOBOOK;
  return Permission.AUTO_APPROVE_EBOOK;
}

export function getManageRequestPermission(
  type: string,
  format?: string
): Permission {
  if (type === 'music') return Permission.MANAGE_REQUESTS_MUSIC;
  if (format === 'audiobook') return Permission.MANAGE_REQUESTS_AUDIOBOOK;
  return Permission.MANAGE_REQUESTS_EBOOK;
}

export function getViewRequestPermission(
  type: string,
  format?: string
): Permission {
  if (type === 'music') return Permission.REQUEST_VIEW_MUSIC;
  if (format === 'audiobook') return Permission.REQUEST_VIEW_AUDIOBOOK;
  return Permission.REQUEST_VIEW_EBOOK;
}
