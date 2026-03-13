import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { fetcher, apiPost, apiPut, apiDelete } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import type { PermissionRole } from '../../types/api';
import { permissionCategories, allPermissionEntries } from '../../components/Settings/permissionConfig';

export default function UsersSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_PERMISSIONS);
  const { settings: publicSettings } = useSettings();
  const { data: roles, mutate } = useSWR<PermissionRole[]>(
    hasAccess ? '/api/v1/settings/roles' : null,
    fetcher
  );
  const tc = useTranslations('common');
  const t = useTranslations('settings');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState(0);
  const [formEbookQuotaLimit, setFormEbookQuotaLimit] = useState<number | undefined>(undefined);
  const [formAudiobookQuotaLimit, setFormAudiobookQuotaLimit] = useState<number | undefined>(undefined);
  const [formMusicQuotaLimit, setFormMusicQuotaLimit] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  };

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setFormName('');
    setFormPermissions(0);
    setFormEbookQuotaLimit(undefined);
    setFormAudiobookQuotaLimit(undefined);
    setFormMusicQuotaLimit(undefined);
  };

  const startEdit = (role: PermissionRole) => {
    setCreating(false);
    setEditingId(role.id);
    setFormName(role.name);
    setFormPermissions(role.permissions);
    setFormEbookQuotaLimit(role.ebookQuotaLimit);
    setFormAudiobookQuotaLimit(role.audiobookQuotaLimit);
    setFormMusicQuotaLimit(role.musicQuotaLimit);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
  };

  const togglePermission = (perm: number) => {
    setFormPermissions((prev) => prev ^ perm);
  };

  const toggleCategory = (entries: { key: string; value: number }[]) => {
    const allEnabled = entries.every(
      ({ value }) => (formPermissions & value) === value
    );
    if (allEnabled) {
      let next = formPermissions;
      entries.forEach(({ value }) => (next = next & ~value));
      setFormPermissions(next);
    } else {
      let next = formPermissions;
      entries.forEach(({ value }) => (next = next | value));
      setFormPermissions(next);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        await apiPost('/settings/roles', {
          name: formName,
          permissions: formPermissions,
          ebookQuotaLimit: formEbookQuotaLimit ?? null,
          audiobookQuotaLimit: formAudiobookQuotaLimit ?? null,
          musicQuotaLimit: formMusicQuotaLimit ?? null,
        });
        showFeedback(t('roleCreated'));
      } else if (editingId !== null) {
        await apiPut(`/settings/roles/${editingId}`, {
          name: formName,
          permissions: formPermissions,
          ebookQuotaLimit: formEbookQuotaLimit ?? null,
          audiobookQuotaLimit: formAudiobookQuotaLimit ?? null,
          musicQuotaLimit: formMusicQuotaLimit ?? null,
        });
        showFeedback(t('roleSaved'));
      }
      mutate();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: number) => {
    await apiPut(`/settings/roles/${id}`, { isDefault: true });
    mutate();
    showFeedback(t('roleSaved'));
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('confirmDeleteRole'))) return;
    await apiDelete(`/settings/roles/${id}`);
    mutate();
    showFeedback(t('roleDeleted'));
  };

  const enabledCount = (permissions: number) =>
    allPermissionEntries.filter(({ value }) => (permissions & value) === value)
      .length;

  const isEditing = creating || editingId !== null;

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>
          {t('usersTitle')} - {publicSettings?.appTitle || 'Librarr'}
        </title>
      </Head>
      <div>
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{t('rolesTitle')}</h1>
            <p className="text-sm text-librarr-text-muted mt-1">
              {t('rolesDescription')}
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={startCreate}
              className="btn-primary flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('addRole')}
            </button>
          )}
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {feedback}
          </div>
        )}

        {/* Role cards */}
        {roles && roles.length > 0 && (
          <div className="grid gap-4">
            {roles.map((role) => {
              const isAdminRole = role.permissions === Permission.ADMIN;
              const count = enabledCount(role.permissions);
              const total = allPermissionEntries.length;
              const pct = isAdminRole ? 100 : Math.round((count / total) * 100);
              const isBeingEdited = editingId === role.id;

              return (
                <div
                  key={role.id}
                  className={`card overflow-hidden transition-all duration-200 ${
                    isBeingEdited
                      ? 'ring-2 ring-librarr-primary'
                      : ''
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                          isAdminRole
                            ? 'bg-amber-500/20 text-amber-400'
                            : role.isDefault
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-librarr-primary/20 text-librarr-primary-light'
                        }`}
                      >
                        {isAdminRole ? (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        ) : (
                          role.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base truncate">
                            {role.name}
                          </span>
                          {role.isDefault && (
                            <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                              {t('roleDefault')}
                            </span>
                          )}
                        </div>
                        {isAdminRole ? (
                          <p className="text-xs text-amber-400/80 mt-1">
                            {t('roleAdminDescription')}
                          </p>
                        ) : (
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-librarr-text-muted">
                              {count}/{total} {t('permissions')}
                            </span>
                            {/* Mini progress bar */}
                            <div className="w-20 h-1.5 rounded-full bg-librarr-bg-lighter overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  pct > 70
                                    ? 'bg-green-500'
                                    : pct > 30
                                    ? 'bg-librarr-primary'
                                    : 'bg-librarr-text-muted'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions (hidden for Admin role) */}
                    {!isEditing && !isAdminRole && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(role)}
                          className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-text hover:bg-librarr-bg-lighter transition-colors"
                          title={t('editRole')}
                        >
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {!role.isDefault && (
                          <>
                            <button
                              onClick={() => handleSetDefault(role.id)}
                              className="p-2 rounded-lg text-librarr-text-muted hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                              title={t('setAsDefault')}
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(role.id)}
                              className="p-2 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title={t('deleteRole')}
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expandable edit panel (not for Admin role) */}
                  {isBeingEdited && !isAdminRole && (
                    <div className="border-t border-librarr-bg-lighter px-5 py-5 space-y-5 bg-librarr-bg/50">
                      <RoleEditor
                        formName={formName}
                        formPermissions={formPermissions}
                        formEbookQuotaLimit={formEbookQuotaLimit}
                        formAudiobookQuotaLimit={formAudiobookQuotaLimit}
                        formMusicQuotaLimit={formMusicQuotaLimit}
                        saving={saving}
                        onNameChange={setFormName}
                        onTogglePermission={togglePermission}
                        onToggleCategory={toggleCategory}
                        onEbookQuotaChange={setFormEbookQuotaLimit}
                        onAudiobookQuotaChange={setFormAudiobookQuotaLimit}
                        onMusicQuotaChange={setFormMusicQuotaLimit}
                        onSave={handleSave}
                        onCancel={cancelEdit}
                        t={t}
                        tc={tc}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {roles && roles.length === 0 && !creating && (
          <div className="card p-12 text-center">
            <svg
              className="w-12 h-12 mx-auto text-librarr-text-muted mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-librarr-text-muted mb-4">{t('noRoles')}</p>
            <button onClick={startCreate} className="btn-primary">
              {t('addRole')}
            </button>
          </div>
        )}

        {/* Create new role card */}
        {creating && (
          <div className="card overflow-hidden ring-2 ring-librarr-primary mt-4">
            <div className="flex items-center gap-3 p-5 border-b border-librarr-bg-lighter">
              <div className="w-10 h-10 rounded-lg bg-librarr-primary/20 text-librarr-primary-light flex items-center justify-center">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="font-semibold text-base">{t('addRole')}</span>
            </div>
            <div className="px-5 py-5 space-y-5 bg-librarr-bg/50">
              <RoleEditor
                formName={formName}
                formPermissions={formPermissions}
                formEbookQuotaLimit={formEbookQuotaLimit}
                formAudiobookQuotaLimit={formAudiobookQuotaLimit}
                formMusicQuotaLimit={formMusicQuotaLimit}
                saving={saving}
                onNameChange={setFormName}
                onTogglePermission={togglePermission}
                onToggleCategory={toggleCategory}
                onEbookQuotaChange={setFormEbookQuotaLimit}
                onAudiobookQuotaChange={setFormAudiobookQuotaLimit}
                onMusicQuotaChange={setFormMusicQuotaLimit}
                onSave={handleSave}
                onCancel={cancelEdit}
                t={t}
                tc={tc}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function RoleEditor({
  formName,
  formPermissions,
  formEbookQuotaLimit,
  formAudiobookQuotaLimit,
  formMusicQuotaLimit,
  saving,
  onNameChange,
  onTogglePermission,
  onToggleCategory,
  onEbookQuotaChange,
  onAudiobookQuotaChange,
  onMusicQuotaChange,
  onSave,
  onCancel,
  t,
  tc,
}: {
  formName: string;
  formPermissions: number;
  formEbookQuotaLimit: number | undefined;
  formAudiobookQuotaLimit: number | undefined;
  formMusicQuotaLimit: number | undefined;
  saving: boolean;
  onNameChange: (v: string) => void;
  onTogglePermission: (perm: number) => void;
  onToggleCategory: (entries: { key: string; value: number }[]) => void;
  onEbookQuotaChange: (v: number | undefined) => void;
  onAudiobookQuotaChange: (v: number | undefined) => void;
  onMusicQuotaChange: (v: number | undefined) => void;
  onSave: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      {/* Name field */}
      <div>
        <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
          {t('roleName')}
        </label>
        <input
          type="text"
          className="input-field max-w-sm"
          value={formName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('roleName')}
          autoFocus
        />
      </div>

      {/* Permissions by category */}
      <div className="space-y-4">
        {permissionCategories.map((category) => {
          const allEnabled = category.entries.every(
            ({ value }) => (formPermissions & value) === value
          );
          const someEnabled =
            !allEnabled &&
            category.entries.some(
              ({ value }) => (formPermissions & value) === value
            );

          return (
            <div
              key={category.labelKey}
              className="rounded-lg border border-librarr-bg-lighter overflow-hidden"
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => onToggleCategory(category.entries)}
                className="w-full flex items-center gap-3 px-4 py-2.5 bg-librarr-bg-lighter/50 hover:bg-librarr-bg-lighter transition-colors text-left"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    allEnabled
                      ? 'bg-librarr-primary border-librarr-primary'
                      : someEnabled
                      ? 'border-librarr-primary bg-librarr-primary/30'
                      : 'border-librarr-bg-lighter'
                  }`}
                >
                  {(allEnabled || someEnabled) && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      {allEnabled ? (
                        <path d="M20 6L9 17l-5-5" />
                      ) : (
                        <line x1="6" y1="12" x2="18" y2="12" />
                      )}
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {t(category.labelKey)}
                </span>
                <span className="text-xs text-librarr-text-muted ml-auto">
                  {category.entries.filter(
                    ({ value }) => (formPermissions & value) === value
                  ).length}
                  /{category.entries.length}
                </span>
              </button>

              {/* Permission checkboxes */}
              <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {category.entries.map(({ key, value }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={(formPermissions & value) === value}
                      onChange={() => onTogglePermission(value)}
                      className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
                    />
                    <span className="text-sm">{t(key)}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Request Quotas */}
      <div className="rounded-lg border border-librarr-bg-lighter overflow-hidden">
        <div className="px-4 py-2.5 bg-librarr-bg-lighter/50">
          <span className="text-sm font-medium">{t('quotaTitle')}</span>
          <p className="text-xs text-librarr-text-muted mt-0.5">{t('quotaDescription')}</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="block text-sm text-librarr-text-muted mb-1">
              {t('quotaEbookLabel')}
            </label>
            <input
              type="number"
              min="0"
              className="input-field max-w-[10rem]"
              value={formEbookQuotaLimit ?? ''}
              onChange={(e) => onEbookQuotaChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder={t('quotaUnlimited')}
            />
          </div>
          <div>
            <label className="block text-sm text-librarr-text-muted mb-1">
              {t('quotaAudiobookLabel')}
            </label>
            <input
              type="number"
              min="0"
              className="input-field max-w-[10rem]"
              value={formAudiobookQuotaLimit ?? ''}
              onChange={(e) => onAudiobookQuotaChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder={t('quotaUnlimited')}
            />
          </div>
          <div className="opacity-50">
            <label className="block text-sm text-librarr-text-muted mb-1">
              {t('quotaMusicLabel')}
            </label>
            <input
              type="number"
              min="0"
              className="input-field max-w-[10rem]"
              value={formMusicQuotaLimit ?? ''}
              onChange={(e) => onMusicQuotaChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder={t('quotaUnlimited')}
              disabled
            />
            <p className="text-xs text-librarr-text-muted mt-1">{t('quotaComingSoon')}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={saving || !formName.trim()}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          {saving ? tc('loading') : tc('save')}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          {tc('cancel')}
        </button>
      </div>
    </>
  );
}
