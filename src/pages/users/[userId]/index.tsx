import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useUser } from '../../../context/UserContext';
import { useSettings } from '../../../context/SettingsContext';
import { useLocale } from '../../../context/LocaleContext';
import { fetcher } from '../../../hooks/useApi';
import { Permission, hasPermission } from '../../../constants/permissions';
import LoadingSpinner from '../../../components/Common/LoadingSpinner';
import CoverImage from '../../../components/Common/CoverImage';
import { RequestStatus } from '../../../constants/media';
import type {
  UserSummary,
  UserQuotaResponse,
  PaginatedResponse,
  RequestListItem,
  BookRequestItem,
} from '../../../types/api';
import { userTypeLabels } from '../../../constants/userTypes';

export default function UserProfilePage() {
  const router = useRouter();
  const { userId } = router.query;
  const { user: currentUser } = useUser();
  const { settings } = useSettings();
  const { locale } = useLocale();
  const t = useTranslations('profile');
  const tr = useTranslations('requests');
  const tq = useTranslations('quota');

  const { data: user, isLoading, error } = useSWR<UserSummary>(
    userId ? `/api/v1/user/${userId}` : null,
    fetcher
  );

  const { data: requests } = useSWR<PaginatedResponse<RequestListItem>>(
    user ? `/api/v1/request?requestedBy=${userId}&take=10` : null,
    fetcher
  );

  const { data: quota } = useSWR<UserQuotaResponse>(
    user ? `/api/v1/user/${userId}/quota` : null,
    fetcher
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !user) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <p className="text-lg font-medium mb-1">{t('accessDenied')}</p>
        <p className="text-sm">{t('accessDeniedDescription')}</p>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === user.id;
  const canEditSettings = isOwnProfile || (currentUser && (
    hasPermission(currentUser.permissions, Permission.ADMIN) ||
    hasPermission(currentUser.permissions, Permission.MANAGE_USERS)
  ));

  const isBookRequest = (req: RequestListItem): req is BookRequestItem =>
    req.type === 'book';

  const getTitle = (request: RequestListItem): string => {
    if (isBookRequest(request)) return request.work?.title || 'Unknown';
    return request.album?.title || 'Unknown';
  };

  const getCoverUrl = (request: RequestListItem): string | undefined => {
    if (isBookRequest(request)) return request.work?.coverUrl;
    return request.album?.coverUrl;
  };

  const getDetailLink = (request: RequestListItem): string | null => {
    if (isBookRequest(request) && request.work?.hardcoverId) {
      return `/book/${request.work.hardcoverId}`;
    }
    if (!isBookRequest(request) && request.album?.musicBrainzId) {
      return `/music/${request.album.musicBrainzId}`;
    }
    return null;
  };

  const getRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      if (diffSec < 60) return rtf.format(-diffSec, 'second');
      if (diffMins < 60) return rtf.format(-diffMins, 'minute');
      if (diffHours < 24) return rtf.format(-diffHours, 'hour');
      if (diffDays < 30) return rtf.format(-diffDays, 'day');
    } catch {
      // fallback
    }
    return date.toLocaleDateString(locale);
  };

  const statusBadge = (status: number) => {
    const config = {
      [RequestStatus.PENDING]: { label: tr('pending'), bg: 'bg-yellow-500' },
      [RequestStatus.APPROVED]: { label: tr('approved'), bg: 'bg-librarr-primary' },
      [RequestStatus.DECLINED]: { label: tr('declined'), bg: 'bg-librarr-danger' },
      [RequestStatus.FAILED]: { label: tr('failed'), bg: 'bg-red-600' },
      [RequestStatus.COMPLETED]: { label: tr('completed'), bg: 'bg-librarr-success' },
    }[status] || { label: tr('pending'), bg: 'bg-gray-500' };

    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${config.bg}`}>
        {config.label}
      </span>
    );
  };

  const formatBadge = (request: RequestListItem) => {
    if (!isBookRequest(request)) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          {tr('formatMusic')}
        </span>
      );
    }

    if (request.format === 'ebook') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {tr('formatEbook')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {tr('formatAudiobook')}
      </span>
    );
  };

  return (
    <>
      <Head>
        <title>{user.username} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-librarr-primary flex items-center justify-center text-3xl font-bold text-white">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{user.username}</h1>
              {user.email && (
                <p className="text-sm text-librarr-text-muted">{user.email}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-librarr-text-muted">
                <span>{t('type', { type: userTypeLabels[user.userType] || 'Unknown' })}</span>
                <span>{t('joined', { date: new Date(user.createdAt).toLocaleDateString(locale) })}</span>
              </div>
            </div>
            {canEditSettings && (
              <Link
                href={`/users/${user.id}/settings`}
                className="btn-primary"
              >
                {t('editSettings')}
              </Link>
            )}
          </div>
        </div>

        {/* Quota usage */}
        {quota && (
          <div className="card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">{tq('title')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Ebook quota */}
              <div className="rounded-lg border border-librarr-bg-lighter p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium inline-flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    {tq('ebookRequests')}
                  </span>
                  <span className="text-sm text-librarr-text-muted">
                    {quota.ebook.limit !== null
                      ? `${quota.ebook.used} / ${quota.ebook.limit}`
                      : tq('unlimited')}
                  </span>
                </div>
                {quota.ebook.limit !== null && (
                  <div className="w-full h-2 rounded-full bg-librarr-bg-lighter overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        quota.ebook.remaining === 0
                          ? 'bg-red-500'
                          : quota.ebook.used / quota.ebook.limit > 0.7
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (quota.ebook.used / quota.ebook.limit) * 100)}%`,
                      }}
                    />
                  </div>
                )}
                <p className="text-xs text-librarr-text-muted mt-1.5">{tq('windowInfo')}</p>
              </div>

              {/* Audiobook quota */}
              <div className="rounded-lg border border-librarr-bg-lighter p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium inline-flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    {tq('audiobookRequests')}
                  </span>
                  <span className="text-sm text-librarr-text-muted">
                    {quota.audiobook.limit !== null
                      ? `${quota.audiobook.used} / ${quota.audiobook.limit}`
                      : tq('unlimited')}
                  </span>
                </div>
                {quota.audiobook.limit !== null && (
                  <div className="w-full h-2 rounded-full bg-librarr-bg-lighter overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        quota.audiobook.remaining === 0
                          ? 'bg-red-500'
                          : quota.audiobook.used / quota.audiobook.limit > 0.7
                          ? 'bg-yellow-500'
                          : 'bg-purple-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (quota.audiobook.used / quota.audiobook.limit) * 100)}%`,
                      }}
                    />
                  </div>
                )}
                <p className="text-xs text-librarr-text-muted mt-1.5">{tq('windowInfo')}</p>
              </div>

              {/* Music quota */}
              <div className="rounded-lg border border-librarr-bg-lighter p-4 opacity-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{tq('musicRequests')}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    {tq('comingSoon')}
                  </span>
                </div>
              </div>
            </div>

            {/* Total request count (all-time) */}
            {requests?.pageInfo && (
              <p className="text-sm text-librarr-text-muted mt-4">
                {tq('totalRequests', { count: requests.pageInfo.results })}
              </p>
            )}
          </div>
        )}

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">{t('recentRequests')}</h2>
          {requests?.results && requests.results.length > 0 ? (
            <div className="space-y-2">
              {requests.results.map((request) => {
                const link = getDetailLink(request);
                const coverUrl = getCoverUrl(request);
                const title = getTitle(request);

                return (
                  <div
                    key={`${request.type}-${request.id}`}
                    className="flex items-stretch overflow-hidden rounded-lg bg-librarr-bg-light/50 border border-librarr-bg-lighter"
                  >
                    {/* Cover thumbnail */}
                    <div className="relative flex-shrink-0 w-12 bg-librarr-bg-lighter">
                      {coverUrl ? (
                        <CoverImage
                          src={coverUrl}
                          alt={title}
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-librarr-bg-lighter text-librarr-text-muted">
                          {isBookRequest(request) ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          {statusBadge(request.status)}
                          {formatBadge(request)}
                        </div>
                        <p className="font-medium truncate text-sm">
                          {link ? (
                            <Link href={link} className="hover:text-librarr-primary transition-colors">
                              {title}
                            </Link>
                          ) : (
                            title
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-librarr-text-muted flex-shrink-0">
                        {getRelativeTime(request.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-librarr-text-muted">{t('noRequests')}</p>
          )}
        </div>
      </div>
    </>
  );
}
