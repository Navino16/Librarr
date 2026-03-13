import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useUser } from '../../context/UserContext';
import { hasPermission, Permission } from '../../constants/permissions';
import { IconGeneral, IconUsers, IconBook, IconMusic, IconServer, IconBell, IconClock, IconDatabase, IconUnmatched, IconAuth } from '../../components/Settings/settingsIcons';

const iconMap: Record<string, React.FC> = {
  '/settings/general': IconGeneral,
  '/settings/auth': IconAuth,
  '/settings/users': IconUsers,
  '/settings/readarr': IconBook,
  '/settings/lidarr': IconMusic,
  '/settings/media-server': IconServer,
  '/settings/notifications': IconBell,
  '/settings/jobs': IconClock,
  '/settings/metadata': IconDatabase,
  '/settings/unmatched': IconUnmatched,
};

const colorMap: Record<string, string> = {
  '/settings/general': 'bg-librarr-primary/15 text-librarr-primary-light',
  '/settings/auth': 'bg-indigo-500/15 text-indigo-400',
  '/settings/users': 'bg-green-500/15 text-green-400',
  '/settings/readarr': 'bg-amber-500/15 text-amber-400',
  '/settings/lidarr': 'bg-cyan-500/15 text-cyan-400',
  '/settings/media-server': 'bg-blue-500/15 text-blue-400',
  '/settings/notifications': 'bg-red-500/15 text-red-400',
  '/settings/jobs': 'bg-orange-500/15 text-orange-400',
  '/settings/metadata': 'bg-purple-500/15 text-purple-400',
  '/settings/unmatched': 'bg-yellow-500/15 text-yellow-400',
};

const settingsPermissions: Record<string, number> = {
  '/settings/general': Permission.MANAGE_SETTINGS_GENERAL,
  '/settings/auth': Permission.MANAGE_SETTINGS_GENERAL,
  '/settings/users': Permission.MANAGE_SETTINGS_PERMISSIONS,
  '/settings/readarr': Permission.MANAGE_SETTINGS_READARR,
  '/settings/lidarr': Permission.MANAGE_SETTINGS_LIDARR,
  '/settings/media-server': Permission.MANAGE_SETTINGS_MEDIA_SERVERS,
  '/settings/notifications': Permission.MANAGE_SETTINGS_NOTIFICATIONS,
  '/settings/jobs': Permission.MANAGE_SETTINGS_JOBS,
  '/settings/metadata': Permission.MANAGE_SETTINGS_METADATA,
  '/settings/unmatched': Permission.MANAGE_SETTINGS_MEDIA_SERVERS,
};

export default function SettingsPage() {
  const { settings } = useSettings();
  const { user } = useUser();
  const t = useTranslations('settings');

  const settingsLinks = [
    { href: '/settings/general', labelKey: 'general', descriptionKey: 'generalDescription' },
    { href: '/settings/auth', labelKey: 'auth', descriptionKey: 'authDescription' },
    { href: '/settings/media-server', labelKey: 'mediaServer', descriptionKey: 'mediaServerDescription' },
    { href: '/settings/readarr', labelKey: 'readarr', descriptionKey: 'readarrDescription' },
    { href: '/settings/lidarr', labelKey: 'lidarr', descriptionKey: 'lidarrDescription', comingSoon: true },
    { href: '/settings/metadata', labelKey: 'metadata', descriptionKey: 'metadataDescription' },
    { href: '/settings/notifications', labelKey: 'notifications', descriptionKey: 'notificationsDescription' },
    { href: '/settings/users', labelKey: 'users', descriptionKey: 'usersDescription' },
    { href: '/settings/jobs', labelKey: 'jobsCache', descriptionKey: 'jobsCacheDescription' },
    { href: '/settings/unmatched', labelKey: 'unmatchedItems', descriptionKey: 'unmatchedItemsDescription' },
  ];

  const visibleLinks = settingsLinks.filter((link) => {
    const perm = settingsPermissions[link.href];
    if (!perm || !user) return false;
    return hasPermission(user.permissions, perm);
  });

  return (
    <>
      <Head>
        <title>{t('title')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{t('title')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleLinks.map((link) => {
            const Icon = iconMap[link.href] || IconGeneral;
            const color = colorMap[link.href] || 'bg-librarr-primary/15 text-librarr-primary-light';

            if (link.comingSoon) {
              return (
                <div
                  key={link.href}
                  className="card p-5 flex items-start gap-4 opacity-50 cursor-not-allowed"
                >
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                    <Icon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold flex items-center gap-2">
                      {t(link.labelKey)}
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {t('musicComingSoon')}
                      </span>
                    </h3>
                    <p className="text-sm text-librarr-text-muted mt-0.5">
                      {t(link.descriptionKey)}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                className="card p-5 flex items-start gap-4 hover:border-librarr-primary hover:bg-librarr-bg-lighter/30 transition-all group"
              >
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold group-hover:text-librarr-primary-light transition-colors">
                    {t(link.labelKey)}
                  </h3>
                  <p className="text-sm text-librarr-text-muted mt-0.5">
                    {t(link.descriptionKey)}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-librarr-text-muted ml-auto mt-1 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
