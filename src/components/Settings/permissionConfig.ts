import { Permission } from '../../constants/permissions';

export interface PermissionCategory {
  labelKey: string;
  entries: { key: string; value: number }[];
}

export const permissionCategories: PermissionCategory[] = [
  {
    labelKey: 'categoryUserManagement',
    entries: [
      { key: 'permManageUsers', value: Permission.MANAGE_USERS },
    ],
  },
  {
    labelKey: 'categoryRequestCreation',
    entries: [
      { key: 'permRequestEbook', value: Permission.REQUEST_EBOOK },
      { key: 'permRequestAudiobook', value: Permission.REQUEST_AUDIOBOOK },
      { key: 'permRequestMusic', value: Permission.REQUEST_MUSIC },
    ],
  },
  {
    labelKey: 'categoryAutoApprove',
    entries: [
      { key: 'permAutoApproveEbook', value: Permission.AUTO_APPROVE_EBOOK },
      { key: 'permAutoApproveAudiobook', value: Permission.AUTO_APPROVE_AUDIOBOOK },
      { key: 'permAutoApproveMusic', value: Permission.AUTO_APPROVE_MUSIC },
    ],
  },
  {
    labelKey: 'categoryRequestManagement',
    entries: [
      { key: 'permManageRequestsEbook', value: Permission.MANAGE_REQUESTS_EBOOK },
      { key: 'permManageRequestsAudiobook', value: Permission.MANAGE_REQUESTS_AUDIOBOOK },
      { key: 'permManageRequestsMusic', value: Permission.MANAGE_REQUESTS_MUSIC },
    ],
  },
  {
    labelKey: 'categoryViewRequests',
    entries: [
      { key: 'permRequestViewEbook', value: Permission.REQUEST_VIEW_EBOOK },
      { key: 'permRequestViewAudiobook', value: Permission.REQUEST_VIEW_AUDIOBOOK },
      { key: 'permRequestViewMusic', value: Permission.REQUEST_VIEW_MUSIC },
    ],
  },
  {
    labelKey: 'categoryIssues',
    entries: [
      { key: 'permCreateIssues', value: Permission.CREATE_ISSUES },
      { key: 'permViewIssues', value: Permission.VIEW_ISSUES },
      { key: 'permManageIssues', value: Permission.MANAGE_ISSUES },
    ],
  },
  {
    labelKey: 'categoryQuotas',
    entries: [
      { key: 'permBypassQuota', value: Permission.BYPASS_QUOTA },
    ],
  },
  {
    labelKey: 'categorySettings',
    entries: [
      { key: 'permManageSettingsGeneral', value: Permission.MANAGE_SETTINGS_GENERAL },
      { key: 'permManageSettingsPermissions', value: Permission.MANAGE_SETTINGS_PERMISSIONS },
      { key: 'permManageSettingsReadarr', value: Permission.MANAGE_SETTINGS_READARR },
      { key: 'permManageSettingsLidarr', value: Permission.MANAGE_SETTINGS_LIDARR },
      { key: 'permManageSettingsMediaServers', value: Permission.MANAGE_SETTINGS_MEDIA_SERVERS },
      { key: 'permManageSettingsMetadata', value: Permission.MANAGE_SETTINGS_METADATA },
      { key: 'permManageSettingsNotifications', value: Permission.MANAGE_SETTINGS_NOTIFICATIONS },
      { key: 'permManageSettingsJobs', value: Permission.MANAGE_SETTINGS_JOBS },
    ],
  },
];

export const allPermissionEntries = permissionCategories.flatMap((c) => c.entries);
