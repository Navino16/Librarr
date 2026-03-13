import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';

function buildForm(mainSettings: Record<string, unknown> | undefined) {
  return {
    appTitle: (mainSettings?.appTitle as string) || '',
    applicationUrl: (mainSettings?.applicationUrl as string) || '',
    hideAvailable: (mainSettings?.hideAvailable as boolean) || false,
    hardcoverToken: '',
    enableEbookRequests: (mainSettings?.enableEbookRequests as boolean) ?? true,
    enableAudiobookRequests: (mainSettings?.enableAudiobookRequests as boolean) ?? true,
    enableMusicRequests: (mainSettings?.enableMusicRequests as boolean) ?? false,
  };
}

function SettingsForm({ mainSettings, mutate, mutatePublic }: {
  mainSettings: Record<string, unknown>;
  mutate: () => void;
  mutatePublic: () => void;
}) {
  const { settings: publicSettings } = useSettings();
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [form, setForm] = useState(() => buildForm(mainSettings));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: Record<string, unknown> = {
        appTitle: form.appTitle,
        applicationUrl: form.applicationUrl,
        hideAvailable: form.hideAvailable,
        enableEbookRequests: form.enableEbookRequests,
        enableAudiobookRequests: form.enableAudiobookRequests,
        enableMusicRequests: form.enableMusicRequests,
      };
      if (form.hardcoverToken.trim()) {
        payload.hardcoverToken = form.hardcoverToken.trim();
      }
      await apiPost('/settings/main', payload);
      mutate();
      mutatePublic();
      setSaved(true);
      setForm((prev) => ({ ...prev, hardcoverToken: '' }));
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t('generalTitle')} - {publicSettings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{t('generalTitle')}</h1>

        {/* Feedback toast */}
        {saved && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            {tc('settingsSaved')}
          </div>
        )}
        {saveError && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {saveError}
          </div>
        )}

        {/* Application section */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-librarr-primary/15 text-librarr-primary-light flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('applicationTitle')}</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {t('applicationTitle')}
              </label>
              <input
                type="text"
                className="input-field max-w-md"
                value={form.appTitle}
                onChange={(e) => setForm({ ...form, appTitle: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {t('applicationUrl')}
              </label>
              <input
                type="text"
                className="input-field max-w-md"
                value={form.applicationUrl}
                onChange={(e) => setForm({ ...form, applicationUrl: e.target.value })}
                placeholder="https://librarr.example.com"
              />
            </div>
          </div>
        </div>

        {/* Metadata section */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('bookMetadataServer')}</h2>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <label className="block text-sm font-medium text-librarr-text-muted">
                {t('bookMetadataServer')}
              </label>
              {mainSettings && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  mainSettings.hardcoverTokenSet
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                }`}>
                  {mainSettings.hardcoverTokenSet ? t('tokenConfigured') : t('tokenNotConfigured')}
                </span>
              )}
            </div>
            <input
              type="password"
              className="input-field max-w-md"
              value={form.hardcoverToken}
              onChange={(e) => setForm({ ...form, hardcoverToken: e.target.value })}
              placeholder={t('tokenPlaceholder')}
            />
            <p className="text-xs text-librarr-text-muted mt-2">
              <a href="https://hardcover.app/account/api" target="_blank" rel="noopener noreferrer" className="text-librarr-primary hover:underline">Hardcover</a>{' '}
              {t('bookMetadataHelp')}
            </p>
          </div>
        </div>

        {/* Request Types section */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('requestTypesTitle')}</h2>
            </div>
          </div>
          <div className="p-5 space-y-1">
            <p className="text-sm text-librarr-text-muted mb-3">{t('requestTypesDescription')}</p>
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableEbookRequests}
                onChange={(e) => setForm({ ...form, enableEbookRequests: e.target.checked })}
                className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
              />
              <span className="text-sm">{t('enableEbookRequests')}</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableAudiobookRequests}
                onChange={(e) => setForm({ ...form, enableAudiobookRequests: e.target.checked })}
                className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
              />
              <span className="text-sm">{t('enableAudiobookRequests')}</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg cursor-not-allowed">
              <input
                type="checkbox"
                checked={false}
                disabled
                className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary opacity-50"
              />
              <span className="text-sm text-librarr-text-muted">{t('enableMusicRequests')}</span>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {t('musicComingSoon')}
              </span>
            </label>
          </div>
        </div>

        {/* Options section */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h2 className="font-semibold">{tc('options')}</h2>
            </div>
          </div>
          <div className="p-5 space-y-1">
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.hideAvailable}
                onChange={(e) => setForm({ ...form, hideAvailable: e.target.checked })}
                className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
              />
              <span className="text-sm">{t('hideAvailable')}</span>
            </label>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
          )}
          {saving ? tc('loading') : tc('saveChanges')}
        </button>
      </div>
    </>
  );
}

export default function GeneralSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_GENERAL);
  const { mutate: mutatePublic } = useSettings();
  const { data: mainSettings, mutate } = useSWR(hasAccess ? '/api/v1/settings/main' : null, fetcher);

  if (!hasAccess) return null;
  if (!mainSettings) return null;

  // key forces SettingsForm to remount (and re-init state) when data changes externally
  return (
    <SettingsForm
      key={JSON.stringify(mainSettings)}
      mainSettings={mainSettings}
      mutate={mutate}
      mutatePublic={mutatePublic}
    />
  );
}
