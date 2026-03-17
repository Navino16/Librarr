import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useUser } from '../../../context/UserContext';
import { useSettings } from '../../../context/SettingsContext';
import { apiPost, apiPut, fetcher } from '../../../hooks/useApi';
import { Permission, hasPermission, getAllowedNotificationTypes } from '../../../constants/permissions';
import type { PermissionRole } from '../../../types/api';
import { availableLanguages } from '../../../constants/languages';
import { permissionCategories } from '../../../components/Settings/permissionConfig';
import NotificationTypeSelector from '../../../components/Settings/NotificationTypeSelector';

interface UserSettingsData {
  id: number;
  locale: string;
  discordId?: string;
  telegramChatId?: string;
}

export default function UserSettingsPage() {
  const router = useRouter();
  const { userId } = router.query;
  const { user: currentUser, mutate: mutateUser } = useUser();
  const { settings } = useSettings();
  const t = useTranslations('userSettings');
  const tc = useTranslations('common');
  const ts = useTranslations('settings');
  const tn = useTranslations('notification');
  const tq = useTranslations('quota');

  const isOwnProfile = currentUser?.id === Number(userId);

  // Fetch target user data (for admin editing another user)
  const { data: targetUser, mutate: mutateTargetUser } = useSWR<{ id: number; username: string; email: string; ebookQuotaLimit?: number; audiobookQuotaLimit?: number; musicQuotaLimit?: number }>(
    userId && !isOwnProfile ? `/api/v1/user/${userId}` : null,
    fetcher
  );

  const { data: userSettings, mutate } = useSWR<UserSettingsData>(
    userId ? `/api/v1/user/${userId}/settings/main` : null,
    fetcher
  );

  const { data: notifPrefs, mutate: mutateNotif } = useSWR<{ notificationTypes: number }>(
    userId ? `/api/v1/user/${userId}/settings/notifications` : null,
    fetcher
  );

  const canManagePermissions =
    currentUser &&
    userId &&
    currentUser.id !== Number(userId) &&
    (hasPermission(currentUser.permissions, Permission.ADMIN) ||
      hasPermission(currentUser.permissions, Permission.MANAGE_USERS));

  const { data: userPerms, mutate: mutatePerms } = useSWR<{ permissions: number }>(
    canManagePermissions ? `/api/v1/user/${userId}/settings/permissions` : null,
    fetcher
  );
  const { data: roles } = useSWR<PermissionRole[]>(
    canManagePermissions ? '/api/v1/settings/roles' : null,
    fetcher
  );

  const [form, setForm] = useState({
    username: '',
    email: '',
    locale: 'en',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saved, setSaved] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [notifTypes, setNotifTypes] = useState(0);
  const [notifSaved, setNotifSaved] = useState(false);
  const [editingNotif, setEditingNotif] = useState<string | null>(null);
  const [permValue, setPermValue] = useState(0);
  const [permSaved, setPermSaved] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [quotaEbookLimit, setQuotaEbookLimit] = useState<number | null | undefined>(undefined);
  const [quotaAudiobookLimit, setQuotaAudiobookLimit] = useState<number | null | undefined>(undefined);
  const [quotaSaved, setQuotaSaved] = useState(false);

  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setForm((prev) => ({
        ...prev,
        username: currentUser.username || '',
        email: currentUser.email || '',
      }));
    } else if (targetUser) {
      setForm((prev) => ({
        ...prev,
        username: targetUser.username || '',
        email: targetUser.email || '',
      }));
    }
  }, [currentUser, targetUser, userId, isOwnProfile]);

  useEffect(() => {
    if (userSettings) {
      setForm((prev) => ({ ...prev, locale: userSettings.locale || 'en' }));
    }
  }, [userSettings]);

  useEffect(() => {
    if (notifPrefs) {
      setNotifTypes(notifPrefs.notificationTypes);
    }
  }, [notifPrefs]);

  useEffect(() => {
    if (userPerms) {
      setPermValue(userPerms.permissions);
    }
  }, [userPerms]);

  useEffect(() => {
    if (targetUser) {
      setQuotaEbookLimit(targetUser.ebookQuotaLimit ?? null);
      setQuotaAudiobookLimit(targetUser.audiobookQuotaLimit ?? null);
    }
  }, [targetUser]);

  // Only allow own settings or admin/manager
  const canAccess = currentUser && userId && (
    currentUser.id === Number(userId) ||
    hasPermission(currentUser.permissions, Permission.ADMIN) ||
    hasPermission(currentUser.permissions, Permission.MANAGE_USERS)
  );

  // Target user permissions for notification type filtering
  const targetPermissions = currentUser?.id === Number(userId)
    ? currentUser.permissions
    : userPerms?.permissions ?? 0;
  const allowedNotifTypes = getAllowedNotificationTypes(targetPermissions);

  if (!canAccess) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{tc('accessDenied')}</p>
      </div>
    );
  }

  const handleSaveGeneral = async () => {
    setGeneralError('');
    try {
      await apiPut(`/user/${userId}`, {
        username: form.username,
        email: form.email,
      });
      await apiPost(`/user/${userId}/settings/main`, {
        locale: form.locale,
      });
      mutate();
      mutateUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setGeneralError(e instanceof Error ? e.message : tc('error'));
    }
  };

  const handleSavePassword = async () => {
    setPasswordError('');

    if (!form.newPassword || form.newPassword.length < 8) {
      setPasswordError(t('passwordMinLength'));
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setPasswordError(t('passwordsDoNotMatch'));
      return;
    }

    try {
      await apiPost(`/user/${userId}/settings/password`, {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to update password');
    }
  };

  return (
    <>
      <Head>
        <title>{!isOwnProfile && targetUser ? `${targetUser.username} — ` : ''}{t('title')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/users/${userId}`}
            className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-primary-light hover:bg-librarr-primary/10 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">
            {!isOwnProfile && targetUser
              ? `${targetUser.username} — ${t('title')}`
              : t('title')}
          </h1>
        </div>

        {/* General Settings */}
        <div className="card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-librarr-primary/15 text-librarr-primary-light flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold">{t('general')}</h2>
            </div>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {t('username')}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {t('email')}
                </label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="max-w-md">
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {t('displayLanguage')}
              </label>
              <p className="text-xs text-librarr-text-muted mb-2">
                {t('languageHelp')}
              </p>
              <select
                className="input-field"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            {generalError && (
              <p className="text-sm text-librarr-danger">{generalError}</p>
            )}
            <div className="flex gap-3 items-center">
              <button onClick={handleSaveGeneral} className="btn-primary flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                {tc('saveChanges')}
              </button>
              {saved && (
                <span className="text-sm text-librarr-success">{tc('settingsSaved')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-base font-semibold">{t('password')}</h2>
            </div>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className={`grid grid-cols-1 ${isOwnProfile ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              {isOwnProfile && (
                <div>
                  <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                    {t('currentPassword')}
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder={tc('enterPassword')}
                    value={form.currentPassword}
                    autoComplete="current-password"
                    onChange={(e) =>
                      setForm({ ...form, currentPassword: e.target.value })
                    }
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {t('newPassword')}
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder={tc('minChars')}
                  value={form.newPassword}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setForm({ ...form, newPassword: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {tc('confirmPassword')}
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder={tc('repeatPassword')}
                  value={form.confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setForm({ ...form, confirmPassword: e.target.value })
                  }
                />
              </div>
            </div>
            {passwordError && (
              <p className="text-sm text-librarr-danger">{passwordError}</p>
            )}
            <div className="flex gap-3 items-center">
              <button onClick={handleSavePassword} className="btn-primary flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                {t('updatePassword')}
              </button>
              {passwordSaved && (
                <span className="text-sm text-librarr-success">
                  {t('passwordUpdated')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h2 className="text-base font-semibold">{tn('emailNotifications')}</h2>
            </div>
          </div>
          <div className="p-4 grid gap-3">
            {/* Email — expandable */}
            <div className={`card overflow-hidden transition-all duration-200 ${editingNotif === 'email' ? 'ring-2 ring-librarr-primary' : ''}`}>
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{tn('email')}</h3>
                  <p className="text-sm text-librarr-text-muted mt-0.5">{tn('emailNotificationsDescription')}</p>
                </div>
                {editingNotif !== 'email' && (
                  <button
                    onClick={() => setEditingNotif('email')}
                    className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-primary-light hover:bg-librarr-primary/10 transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
              {editingNotif === 'email' && (
                <div className="border-t border-librarr-bg-lighter px-5 py-5 bg-librarr-bg/50">
                  <div className="space-y-4">
                    <NotificationTypeSelector
                      value={notifTypes}
                      onChange={setNotifTypes}
                      allowedTypes={allowedNotifTypes}
                    />
                    <div className="flex gap-3 items-center">
                      <button
                        onClick={async () => {
                          await apiPost(`/user/${userId}/settings/notifications`, {
                            notificationTypes: notifTypes,
                          });
                          mutateNotif();
                          setNotifSaved(true);
                          setEditingNotif(null);
                          setTimeout(() => setNotifSaved(false), 2000);
                        }}
                        className="btn-primary flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                        {tc('save')}
                      </button>
                      <button onClick={() => setEditingNotif(null)} className="btn-secondary">
                        {tc('cancel')}
                      </button>
                      {notifSaved && (
                        <span className="text-sm text-librarr-success">{tc('settingsSaved')}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pushbullet — coming soon */}
            <div className="card overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tn('pushbullet')}</h3>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {ts('musicComingSoon')}
                    </span>
                  </div>
                  <p className="text-sm text-librarr-text-muted mt-0.5">{tn('pushbulletDescription')}</p>
                </div>
              </div>
            </div>

            {/* Pushover — coming soon */}
            <div className="card overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tn('pushover')}</h3>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {ts('musicComingSoon')}
                    </span>
                  </div>
                  <p className="text-sm text-librarr-text-muted mt-0.5">{tn('pushoverDescription')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Permissions (admin/manager only, viewing another user) */}
        {canManagePermissions && roles && (
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold">{t('permissions')}</h2>
                  <p className="text-xs text-librarr-text-muted">{t('permissionsDescription')}</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {t('applyRole')}
                </label>
                <select
                  className="input-field"
                  value={
                    roles.find((p) => p.permissions === permValue)?.id ?? 'custom'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') return;
                    const role = roles.find((p) => p.id === Number(val));
                    if (role) setPermValue(role.permissions);
                  }}
                >
                  {roles
                    .filter((p) => {
                      if (p.permissions === Permission.ADMIN) {
                        return currentUser && hasPermission(currentUser.permissions, Permission.ADMIN);
                      }
                      return true;
                    })
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  {!roles.find((p) => p.permissions === permValue) && (
                    <option value="custom">{ts('roleCustom')}</option>
                  )}
                </select>
              </div>

              <div className="space-y-4">
                {permissionCategories.map((cat) => (
                  <div key={cat.labelKey}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-librarr-text-muted mb-2">
                      {ts(cat.labelKey)}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cat.entries.map(({ key, value }) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(permValue & value) === value}
                            onChange={() => setPermValue((prev) => prev ^ value)}
                            className="rounded"
                          />
                          <span>{ts(key)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 items-center">
                <button
                  onClick={async () => {
                    setPermSaving(true);
                    try {
                      await apiPost(`/user/${userId}/settings/permissions`, {
                        permissions: permValue,
                      });
                      mutatePerms();
                      setPermSaved(true);
                      setTimeout(() => setPermSaved(false), 2000);
                    } catch (err) {
                      setPasswordError(
                        err instanceof Error ? err.message : tc('error')
                      );
                    } finally {
                      setPermSaving(false);
                    }
                  }}
                  disabled={permSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  {permSaving ? tc('loading') : tc('saveChanges')}
                </button>
                {permSaved && (
                  <span className="text-sm text-librarr-success">
                    {t('permissionsSaved')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Quota Override (admin/manager only, viewing another user) */}
        {canManagePermissions && targetUser && (
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold">{tq('overrideTitle')}</h2>
                  <p className="text-xs text-librarr-text-muted">{tq('overrideDescription')}</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                    {tq('ebookRequestsPerWeek')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    value={quotaEbookLimit ?? ''}
                    onChange={(e) =>
                      setQuotaEbookLimit(e.target.value ? parseInt(e.target.value, 10) : null)
                    }
                    placeholder={tq('useRoleDefault')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                    {tq('audiobookRequestsPerWeek')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    value={quotaAudiobookLimit ?? ''}
                    onChange={(e) =>
                      setQuotaAudiobookLimit(e.target.value ? parseInt(e.target.value, 10) : null)
                    }
                    placeholder={tq('useRoleDefault')}
                  />
                </div>
              </div>
              <p className="text-xs text-librarr-text-muted">{tq('emptyUsesRoleDefault')}</p>
              <div className="flex gap-3 items-center">
                <button
                  onClick={async () => {
                    await apiPut(`/user/${userId}`, {
                      ebookQuotaLimit: quotaEbookLimit,
                      audiobookQuotaLimit: quotaAudiobookLimit,
                    });
                    mutateTargetUser();
                    setQuotaSaved(true);
                    setTimeout(() => setQuotaSaved(false), 2000);
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  {tc('saveChanges')}
                </button>
                {quotaSaved && (
                  <span className="text-sm text-librarr-success">{tc('settingsSaved')}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
