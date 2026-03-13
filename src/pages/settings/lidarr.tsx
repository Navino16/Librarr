import React from 'react';
import Head from 'next/head';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';

export default function LidarrSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_LIDARR);
  const { settings } = useSettings();
  const t = useTranslations('settings');

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>{t('lidarrTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold">{t('lidarrTitle')}</h1>
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {t('musicComingSoon')}
          </span>
        </div>
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-librarr-text-muted mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-librarr-text-muted">{t('lidarrComingSoonDescription')}</p>
        </div>
      </div>
    </>
  );
}
