import { describe, it, expect } from 'vitest';
import {
  Permission,
  DefaultRoles,
  hasPermission,
  canRequestAny,
  canManageRequestsAny,
  canViewRequestsAny,
  canAccessSettings,
  getRequestPermission,
  getAutoApprovePermission,
  getManageRequestPermission,
  getViewRequestPermission,
} from '@server/lib/permissions';

describe('hasPermission', () => {
  it('admin has every permission', () => {
    expect(hasPermission(Permission.ADMIN, Permission.MANAGE_USERS)).toBe(true);
    expect(hasPermission(Permission.ADMIN, Permission.REQUEST_EBOOK)).toBe(true);
    expect(hasPermission(Permission.ADMIN, Permission.MANAGE_SETTINGS_GENERAL)).toBe(true);
  });

  it('returns true when user has the exact permission', () => {
    expect(hasPermission(Permission.REQUEST_EBOOK, Permission.REQUEST_EBOOK)).toBe(true);
  });

  it('returns true when user has the permission among others', () => {
    const perms = Permission.REQUEST_EBOOK | Permission.REQUEST_AUDIOBOOK;
    expect(hasPermission(perms, Permission.REQUEST_AUDIOBOOK)).toBe(true);
  });

  it('returns false when user lacks the permission', () => {
    expect(hasPermission(Permission.REQUEST_EBOOK, Permission.MANAGE_USERS)).toBe(false);
  });

  it('returns false for NONE', () => {
    expect(hasPermission(Permission.NONE, Permission.REQUEST_EBOOK)).toBe(false);
  });
});

describe('canRequestAny', () => {
  it('returns true for admin', () => {
    expect(canRequestAny(Permission.ADMIN)).toBe(true);
  });

  it('returns true when user can request ebooks', () => {
    expect(canRequestAny(Permission.REQUEST_EBOOK)).toBe(true);
  });

  it('returns true when user can request audiobooks', () => {
    expect(canRequestAny(Permission.REQUEST_AUDIOBOOK)).toBe(true);
  });

  it('returns true when user can request music', () => {
    expect(canRequestAny(Permission.REQUEST_MUSIC)).toBe(true);
  });

  it('returns false when user has no request permissions', () => {
    expect(canRequestAny(Permission.MANAGE_USERS)).toBe(false);
  });
});

describe('canManageRequestsAny', () => {
  it('returns true for admin', () => {
    expect(canManageRequestsAny(Permission.ADMIN)).toBe(true);
  });

  it('returns true for ebook manage', () => {
    expect(canManageRequestsAny(Permission.MANAGE_REQUESTS_EBOOK)).toBe(true);
  });

  it('returns false without manage permissions', () => {
    expect(canManageRequestsAny(Permission.REQUEST_EBOOK)).toBe(false);
  });
});

describe('canViewRequestsAny', () => {
  it('returns true for admin', () => {
    expect(canViewRequestsAny(Permission.ADMIN)).toBe(true);
  });

  it('returns true for ebook view', () => {
    expect(canViewRequestsAny(Permission.REQUEST_VIEW_EBOOK)).toBe(true);
  });

  it('returns false without view permissions', () => {
    expect(canViewRequestsAny(Permission.REQUEST_EBOOK)).toBe(false);
  });
});

describe('canAccessSettings', () => {
  it('returns true for admin', () => {
    expect(canAccessSettings(Permission.ADMIN)).toBe(true);
  });

  it('returns true for any settings permission', () => {
    expect(canAccessSettings(Permission.MANAGE_SETTINGS_GENERAL)).toBe(true);
    expect(canAccessSettings(Permission.MANAGE_SETTINGS_JOBS)).toBe(true);
  });

  it('returns false without settings permissions', () => {
    expect(canAccessSettings(Permission.MANAGE_USERS)).toBe(false);
  });
});

describe('getRequestPermission', () => {
  it('returns MUSIC for music type', () => {
    expect(getRequestPermission('music')).toBe(Permission.REQUEST_MUSIC);
  });

  it('returns AUDIOBOOK for audiobook format', () => {
    expect(getRequestPermission('book', 'audiobook')).toBe(Permission.REQUEST_AUDIOBOOK);
  });

  it('returns EBOOK by default', () => {
    expect(getRequestPermission('book')).toBe(Permission.REQUEST_EBOOK);
    expect(getRequestPermission('book', 'ebook')).toBe(Permission.REQUEST_EBOOK);
  });
});

describe('getAutoApprovePermission', () => {
  it('returns MUSIC for music type', () => {
    expect(getAutoApprovePermission('music')).toBe(Permission.AUTO_APPROVE_MUSIC);
  });

  it('returns AUDIOBOOK for audiobook format', () => {
    expect(getAutoApprovePermission('book', 'audiobook')).toBe(Permission.AUTO_APPROVE_AUDIOBOOK);
  });

  it('returns EBOOK by default', () => {
    expect(getAutoApprovePermission('book')).toBe(Permission.AUTO_APPROVE_EBOOK);
  });
});

describe('getManageRequestPermission', () => {
  it('returns MUSIC for music type', () => {
    expect(getManageRequestPermission('music')).toBe(Permission.MANAGE_REQUESTS_MUSIC);
  });

  it('returns AUDIOBOOK for audiobook format', () => {
    expect(getManageRequestPermission('book', 'audiobook')).toBe(Permission.MANAGE_REQUESTS_AUDIOBOOK);
  });

  it('returns EBOOK by default', () => {
    expect(getManageRequestPermission('book')).toBe(Permission.MANAGE_REQUESTS_EBOOK);
  });
});

describe('getViewRequestPermission', () => {
  it('returns MUSIC for music type', () => {
    expect(getViewRequestPermission('music')).toBe(Permission.REQUEST_VIEW_MUSIC);
  });

  it('returns AUDIOBOOK for audiobook format', () => {
    expect(getViewRequestPermission('book', 'audiobook')).toBe(Permission.REQUEST_VIEW_AUDIOBOOK);
  });

  it('returns EBOOK by default', () => {
    expect(getViewRequestPermission('book')).toBe(Permission.REQUEST_VIEW_EBOOK);
  });
});

describe('DefaultRoles', () => {
  it('ADMIN is just the ADMIN flag', () => {
    expect(DefaultRoles.ADMIN).toBe(Permission.ADMIN);
  });

  it('MANAGER can request all formats', () => {
    expect(hasPermission(DefaultRoles.MANAGER, Permission.REQUEST_EBOOK)).toBe(true);
    expect(hasPermission(DefaultRoles.MANAGER, Permission.REQUEST_AUDIOBOOK)).toBe(true);
    expect(hasPermission(DefaultRoles.MANAGER, Permission.REQUEST_MUSIC)).toBe(true);
  });

  it('MANAGER can manage requests', () => {
    expect(canManageRequestsAny(DefaultRoles.MANAGER)).toBe(true);
  });

  it('MANAGER can view all requests', () => {
    expect(canViewRequestsAny(DefaultRoles.MANAGER)).toBe(true);
  });

  it('MANAGER cannot access settings', () => {
    expect(canAccessSettings(DefaultRoles.MANAGER)).toBe(false);
  });

  it('USER can request all formats', () => {
    expect(canRequestAny(DefaultRoles.USER)).toBe(true);
  });

  it('USER cannot manage requests', () => {
    expect(canManageRequestsAny(DefaultRoles.USER)).toBe(false);
  });

  it('USER cannot view all requests', () => {
    expect(canViewRequestsAny(DefaultRoles.USER)).toBe(false);
  });
});
