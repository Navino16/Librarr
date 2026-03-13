import React, { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useUser } from '../../context/UserContext';
import { useLocale } from '../../context/LocaleContext';
import { fetcher, apiPut, apiDelete, apiGet } from '../../hooks/useApi';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import CoverImage from '../../components/Common/CoverImage';
import Modal from '../../components/Common/Modal';
import { RequestStatus, DeclineReasons } from '../../constants/media';
import { Permission, hasPermission, getManageRequestPermission } from '../../constants/permissions';
import { declineReasonTranslationKeys } from '../../constants/requests';
import { getLanguageName } from '../../utils/languageNames';
import type {
  DeclineReason,
  PaginatedResponse,
  RequestListItem,
  BookRequestItem,
  RequestCountResponse,
} from '../../types/api';

interface ServerOption {
  id: number;
  name: string;
  isDefault: boolean;
}

type StatusFilterKey = '' | 'pending' | 'approved' | 'declined' | 'completed' | 'failed';

const STATUS_FILTER_MAP: Record<StatusFilterKey, number | undefined> = {
  '': undefined,
  pending: RequestStatus.PENDING,
  approved: RequestStatus.APPROVED,
  declined: RequestStatus.DECLINED,
  completed: RequestStatus.COMPLETED,
  failed: RequestStatus.FAILED,
};

export default function RequestsPage() {
  const { settings } = useSettings();
  const { user } = useUser();
  const { locale } = useLocale();
  const [filter, setFilter] = useState<StatusFilterKey>('');
  const [page, setPage] = useState(0);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineModal, setDeclineModal] = useState<{ requestId: number } | null>(null);
  const [declineReason, setDeclineReason] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [approveModal, setApproveModal] = useState<{ requestId: number } | null>(null);
  const [serverList, setServerList] = useState<ServerOption[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const t = useTranslations('requests');
  const tc = useTranslations('common');
  const td = useTranslations('download');
  const pageSize = 20;

  // Build query string with proper status param
  const statusParam = STATUS_FILTER_MAP[filter];
  const queryString = `/api/v1/request?take=${pageSize}&skip=${page * pageSize}${statusParam != null ? `&status=${statusParam}` : ''}`;

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<RequestListItem>>(
    queryString,
    fetcher
  );

  // Fetch status counts
  const { data: counts } = useSWR<RequestCountResponse>(
    '/api/v1/request/count',
    fetcher
  );

  // --- Helpers ---

  const isBookRequest = (req: RequestListItem): req is BookRequestItem =>
    req.type === 'book';

  const canManageRequest = (request: RequestListItem): boolean => {
    if (!user) return false;
    const format = isBookRequest(request) ? request.format : undefined;
    const perm = getManageRequestPermission(request.type, format);
    return hasPermission(user.permissions, perm);
  };

  const canViewProfiles = user && (
    hasPermission(user.permissions, Permission.ADMIN) ||
    hasPermission(user.permissions, Permission.MANAGE_USERS)
  );

  const isOwner = (request: RequestListItem): boolean => {
    return !!user && request.requestedBy?.id === user.id;
  };

  const getTitle = (request: RequestListItem): string => {
    if (isBookRequest(request)) {
      return request.work?.title || t('requestNumber', { id: request.id, type: 'book' });
    }
    return request.album?.title || t('requestNumber', { id: request.id, type: 'music' });
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

  const getDeclineReasonLabel = (reason: string): string => {
    const key = declineReasonTranslationKeys[reason as DeclineReason];
    return key ? t(key) : reason;
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

  const getDownloadStatusLabel = (status?: string): string => {
    if (!status) return '';
    const lower = status.toLowerCase();
    if (lower === 'queued' || lower === 'queue') return td('queued');
    if (lower === 'downloading' || lower === 'download') return td('downloading');
    if (lower === 'paused') return td('paused');
    if (lower === 'completed' || lower === 'imported') return td('completed');
    if (lower === 'failed') return td('failed');
    if (lower === 'warning') return td('warning');
    return status;
  };

  // --- Actions ---

  const handleAction = async (requestId: number, status: number, extra?: Record<string, unknown>) => {
    setActionLoading(requestId);
    setActionError(null);
    try {
      await apiPut(`/request/${requestId}`, { status, ...extra });
      mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : tc('error')
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveClick = async (request: RequestListItem) => {
    try {
      const type = request.type;
      const format = isBookRequest(request) ? request.format : undefined;
      const params: Record<string, string> = { type };
      if (type === 'book' && format) params.format = format;
      const servers = await apiGet<ServerOption[]>('/settings/servers-for-request', params);

      if (servers.length <= 1) {
        await handleAction(request.id, RequestStatus.APPROVED, servers.length === 1 ? { serverId: servers[0].id } : undefined);
      } else {
        setServerList(servers);
        setSelectedServerId(servers.find((s) => s.isDefault)?.id ?? servers[0].id);
        setApproveModal({ requestId: request.id });
      }
    } catch {
      await handleAction(request.id, RequestStatus.APPROVED);
    }
  };

  const handleApproveSubmit = async () => {
    if (!approveModal || selectedServerId == null) return;
    await handleAction(approveModal.requestId, RequestStatus.APPROVED, { serverId: selectedServerId });
    setApproveModal(null);
    setServerList([]);
    setSelectedServerId(null);
  };

  const handleDeclineSubmit = async () => {
    if (!declineModal) return;
    await handleAction(declineModal.requestId, RequestStatus.DECLINED, {
      declineReason: declineReason || undefined,
    });
    setDeclineModal(null);
    setDeclineReason('');
  };

  const handleDelete = async (requestId: number) => {
    setActionLoading(requestId);
    setActionError(null);
    try {
      await apiDelete(`/request/${requestId}`);
      mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : tc('error')
      );
    } finally {
      setActionLoading(null);
      setDeleteConfirm(null);
    }
  };

  // --- Filter tabs with counts ---

  const filters: { key: StatusFilterKey; labelKey: string; count?: number }[] = [
    { key: '', labelKey: 'all', count: counts ? counts.pending + counts.approved + counts.declined + counts.completed + counts.failed : undefined },
    { key: 'pending', labelKey: 'pending', count: counts?.pending },
    { key: 'approved', labelKey: 'approved', count: counts?.approved },
    { key: 'completed', labelKey: 'completed', count: counts?.completed },
    { key: 'declined', labelKey: 'declined', count: counts?.declined },
    { key: 'failed', labelKey: 'failed', count: counts?.failed },
  ];

  const isTerminal = (status: number) =>
    status === RequestStatus.DECLINED || status === RequestStatus.COMPLETED;

  // --- Status badge ---

  const statusBadge = (status: number) => {
    const config = {
      [RequestStatus.PENDING]: { label: t('pending'), bg: 'bg-yellow-500' },
      [RequestStatus.APPROVED]: { label: t('approved'), bg: 'bg-librarr-primary' },
      [RequestStatus.DECLINED]: { label: t('declined'), bg: 'bg-librarr-danger' },
      [RequestStatus.FAILED]: { label: t('failed'), bg: 'bg-red-600' },
      [RequestStatus.COMPLETED]: { label: t('completed'), bg: 'bg-librarr-success' },
    }[status] || { label: t('pending'), bg: 'bg-gray-500' };

    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${config.bg}`}>
        {config.label}
      </span>
    );
  };

  // --- Format badge ---

  const formatBadge = (request: RequestListItem) => {
    if (!isBookRequest(request)) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          {t('formatMusic')}
        </span>
      );
    }

    if (request.format === 'ebook') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {t('formatEbook')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {t('formatAudiobook')}
      </span>
    );
  };

  // --- Download progress bar ---

  const downloadProgress = (request: RequestListItem) => {
    if (
      request.status !== RequestStatus.APPROVED ||
      request.downloadProgress == null ||
      request.downloadProgress <= 0
    ) {
      return null;
    }

    const progress = Math.min(Math.round(request.downloadProgress), 100);
    const isFailed = request.downloadStatus?.toLowerCase() === 'failed';

    return (
      <div className="mt-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-librarr-bg-lighter rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isFailed ? 'bg-red-500' : 'bg-librarr-primary'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-librarr-text-muted tabular-nums">{progress}%</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {request.downloadStatus && (
            <span className={`text-xs ${isFailed ? 'text-red-400' : 'text-librarr-text-muted'}`}>
              {getDownloadStatusLabel(request.downloadStatus)}
            </span>
          )}
          {request.downloadTimeLeft && !isFailed && (
            <span className="text-xs text-librarr-text-muted">
              {t('timeRemaining', { time: request.downloadTimeLeft })}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>{t('title')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

        {actionError && (
          <div className="mb-4 p-3 rounded-lg bg-librarr-danger/10 text-librarr-danger text-sm flex items-center justify-between">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-2 p-1 rounded hover:bg-librarr-danger/20 transition-colors"
              aria-label={tc('dismiss')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Filter tabs with counts */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(0); }}
              aria-current={filter === f.key ? 'true' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                filter === f.key
                  ? 'bg-librarr-primary text-white'
                  : 'bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text'
              }`}
            >
              {f.key === '' ? tc('all') : t(f.labelKey)}
              {f.count != null && f.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs tabular-nums ${
                  filter === f.key
                    ? 'bg-white/20'
                    : 'bg-librarr-bg-lighter'
                }`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Request list */}
        {isLoading ? (
          <LoadingSpinner />
        ) : data && data.results.length > 0 ? (
          <div className="space-y-2">
            {data.results.map((request) => {
              const link = getDetailLink(request);
              const loading = actionLoading === request.id;
              const coverUrl = getCoverUrl(request);
              const title = getTitle(request);

              return (
                <div
                  key={`${request.type}-${request.id}`}
                  className="card flex items-stretch overflow-hidden"
                >
                  {/* Cover thumbnail */}
                  <div className="relative flex-shrink-0 w-14 bg-librarr-bg-lighter">
                    {coverUrl ? (
                      <CoverImage
                        src={coverUrl}
                        alt={title}
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-librarr-bg-lighter text-librarr-text-muted">
                        {isBookRequest(request) ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 px-4 py-3 min-w-0">
                    {/* Title + badges + meta */}
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {statusBadge(request.status)}
                        {formatBadge(request)}
                        {isBookRequest(request) && request.requestedLanguage && (
                          <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            {getLanguageName(request.requestedLanguage)}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <p className="font-medium truncate">
                        {link ? (
                          <Link href={link} className="hover:text-librarr-primary transition-colors">
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </p>

                      {/* Decline reason */}
                      {request.status === RequestStatus.DECLINED && request.declineReason && (
                        <p className="text-xs text-librarr-danger/80 mt-0.5">
                          {t('declinedReason', { reason: getDeclineReasonLabel(request.declineReason) })}
                        </p>
                      )}

                      {/* Download progress (inline on mobile) */}
                      {downloadProgress(request)}
                    </div>

                    {/* Requested by + date */}
                    <div className="hidden md:flex flex-col items-end text-xs text-librarr-text-muted flex-shrink-0 md:w-[120px]">
                      {request.requestedBy && (
                        canViewProfiles ? (
                          <Link href={`/users/${request.requestedBy.id}`} className="flex items-center gap-1.5 hover:text-librarr-primary transition-colors">
                            {request.requestedBy.avatar && (
                              <Image
                                src={request.requestedBy.avatar}
                                alt=""
                                width={16}
                                height={16}
                                className="rounded-full"
                              />
                            )}
                            {request.requestedBy.username}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            {request.requestedBy.avatar && (
                              <Image
                                src={request.requestedBy.avatar}
                                alt=""
                                width={16}
                                height={16}
                                className="rounded-full"
                              />
                            )}
                            {request.requestedBy.username}
                          </span>
                        )
                      )}
                      <span>{getRelativeTime(request.createdAt)}</span>
                    </div>

                    {/* Mobile: user + date inline */}
                    <div className="flex md:hidden items-center gap-2 text-xs text-librarr-text-muted">
                      {request.requestedBy && (
                        canViewProfiles ? (
                          <Link href={`/users/${request.requestedBy.id}`} className="flex items-center gap-1 hover:text-librarr-primary transition-colors">
                            {request.requestedBy.avatar && (
                              <Image
                                src={request.requestedBy.avatar}
                                alt=""
                                width={14}
                                height={14}
                                className="rounded-full"
                              />
                            )}
                            {request.requestedBy.username}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1">
                            {request.requestedBy.avatar && (
                              <Image
                                src={request.requestedBy.avatar}
                                alt=""
                                width={14}
                                height={14}
                                className="rounded-full"
                              />
                            )}
                            {request.requestedBy.username}
                          </span>
                        )
                      )}
                      <span>&middot;</span>
                      <span>{getRelativeTime(request.createdAt)}</span>
                    </div>

                    {/* Actions */}
                    {(canManageRequest(request) || isOwner(request)) && (
                      <div className="flex items-center justify-end gap-2 flex-shrink-0 md:w-[280px]">
                        {/* Approve (pending only, managers) */}
                        {canManageRequest(request) && request.status === RequestStatus.PENDING && (
                          <button
                            onClick={() => handleApproveClick(request)}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-librarr-success text-white hover:bg-librarr-success/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {t('approveRequest')}
                          </button>
                        )}

                        {/* Complete (approved/failed, managers) */}
                        {canManageRequest(request) && (request.status === RequestStatus.APPROVED || request.status === RequestStatus.FAILED) && (
                          <button
                            onClick={() => handleAction(request.id, RequestStatus.COMPLETED)}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-librarr-primary text-white hover:bg-librarr-primary/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {t('completeRequest')}
                          </button>
                        )}

                        {/* Decline / Delete */}
                        {canManageRequest(request) && !isTerminal(request.status) ? (
                          <button
                            onClick={() => {
                              setDeclineReason('');
                              setDeclineModal({ requestId: request.id });
                            }}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {t('declineRequest')}
                          </button>
                        ) : (isOwner(request) || canManageRequest(request)) && isTerminal(request.status) ? (
                          <button
                            onClick={() => setDeleteConfirm(request.id)}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {t('deleteRequest')}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-8 text-center text-librarr-text-muted">
            <p>{t('noRequests')}</p>
          </div>
        )}

        {/* Pagination */}
        {data && data.pageInfo.pages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tc('back')}
            </button>
            <span className="text-sm text-librarr-text-muted">
              {page + 1} / {data.pageInfo.pages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= data.pageInfo.pages}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tc('next')}
            </button>
          </div>
        )}
      </div>

      {/* Server Selection Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title={t('selectServer')}
      >
        <div className="space-y-4">
          <p className="text-sm text-librarr-text-muted">{t('selectServerDescription')}</p>
          <div className="space-y-2">
            {serverList.map((server) => (
              <label
                key={server.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedServerId === server.id
                    ? 'bg-librarr-primary/15 ring-1 ring-librarr-primary'
                    : 'bg-librarr-bg-light hover:bg-librarr-bg-lighter/50'
                }`}
              >
                <input
                  type="radio"
                  name="serverId"
                  value={server.id}
                  checked={selectedServerId === server.id}
                  onChange={() => setSelectedServerId(server.id)}
                  className="text-librarr-primary focus:ring-librarr-primary"
                />
                <span className="text-sm font-medium">{server.name || `Server #${server.id}`}</span>
                {server.isDefault && (
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                    {tc('default')}
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setApproveModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors"
            >
              {tc('cancel')}
            </button>
            <button
              onClick={handleApproveSubmit}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-success text-white hover:bg-librarr-success/80 transition-colors disabled:opacity-50"
            >
              {t('approve')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Decline Modal */}
      <Modal
        open={!!declineModal}
        onClose={() => setDeclineModal(null)}
        title={t('declineModalTitle')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('declineReason')}</label>
            <select
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="input-field w-full"
            >
              <option value="">{t('selectReason')}</option>
              {DeclineReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {t(declineReasonTranslationKeys[reason])}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeclineModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors"
            >
              {tc('cancel')}
            </button>
            <button
              onClick={handleDeclineSubmit}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors disabled:opacity-50"
            >
              {t('decline')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={t('deleteRequest')}
      >
        <div className="space-y-4">
          <p className="text-sm text-librarr-text-muted">{t('confirmDelete')}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors"
            >
              {tc('cancel')}
            </button>
            <button
              onClick={() => deleteConfirm !== null && handleDelete(deleteConfirm)}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors disabled:opacity-50"
            >
              {tc('delete')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
