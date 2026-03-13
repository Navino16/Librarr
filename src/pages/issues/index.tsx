import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useUser } from '../../context/UserContext';
import { useLocale } from '../../context/LocaleContext';
import { fetcher, apiPut, apiDelete } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission, hasPermission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import CoverImage from '../../components/Common/CoverImage';
import Modal from '../../components/Common/Modal';
import type { PaginatedResponse, IssueSummary } from '../../types/api';
import { issueTypeKeys } from '../../constants/issues';

export default function IssuesPage() {
  const hasAccess = useRequirePermission(Permission.VIEW_ISSUES);
  const { user } = useUser();
  const { settings } = useSettings();
  const { locale } = useLocale();
  const [filter, setFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<IssueSummary | null>(null);
  const t = useTranslations('issues');
  const tc = useTranslations('common');

  const canManage = hasPermission(user?.permissions ?? 0, Permission.MANAGE_ISSUES);

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<IssueSummary>>(
    hasAccess ? `/api/v1/issue?take=20&skip=0${filter ? `&filter=${filter}` : ''}` : null,
    fetcher
  );

  const filters = [
    { key: '', labelKey: 'all' as const },
    { key: 'open', labelKey: 'open' as const },
    { key: 'resolved', labelKey: 'resolved' as const },
  ];

  const handleToggleStatus = async (issue: IssueSummary) => {
    const newStatus = issue.status === 1 ? 2 : 1;
    await apiPut(`/issue/${issue.id}`, { status: newStatus });
    mutate();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/issue/${deleteTarget.id}`);
    setDeleteTarget(null);
    mutate();
  };

  function getItemInfo(issue: IssueSummary) {
    if (issue.work) {
      return {
        title: issue.work.title,
        coverUrl: issue.work.coverUrl,
        href: `/book/${issue.work.hardcoverId}`,
      };
    }
    if (issue.musicAlbum) {
      return {
        title: issue.musicAlbum.title,
        coverUrl: issue.musicAlbum.coverUrl,
        href: `/music/${issue.musicAlbum.musicBrainzId}`,
      };
    }
    return null;
  }

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>{t('title')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

        <div className="flex gap-2 mb-6">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-current={filter === f.key ? 'true' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-librarr-primary text-white'
                  : 'bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text'
              }`}
            >
              {f.key === '' ? tc('all') : t(f.labelKey)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : data && data.results.length > 0 ? (
          <div className="space-y-3">
            {data.results.map((issue) => {
              const item = getItemInfo(issue);
              return (
                <div key={issue.id} className="card p-4 flex items-center gap-4">
                  {item && (
                    <Link href={item.href} className="relative shrink-0 w-12 h-16 rounded overflow-hidden bg-librarr-bg-lighter">
                      <CoverImage
                        src={item.coverUrl ?? ''}
                        alt={item.title}
                        sizes="48px"
                        className="object-cover"
                      />
                    </Link>
                  )}

                  <div className="flex-1 min-w-0">
                    <Link href={`/issues/${issue.id}`} className="font-medium hover:text-librarr-primary transition-colors">
                      {t('issueNumber', { id: issue.id, type: t(issueTypeKeys[issue.issueType] || 'other') })}
                    </Link>
                    {item && (
                      <Link href={item.href} className="text-sm text-librarr-primary hover:underline truncate block">
                        {item.title}
                      </Link>
                    )}
                    <p className="text-xs text-librarr-text-muted mt-1">
                      {t('byUser', { username: issue.createdBy?.username ?? '', date: new Date(issue.createdAt).toLocaleDateString(locale) })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium text-white ${
                        issue.status === 1 ? 'bg-librarr-warning' : 'bg-librarr-success'
                      }`}
                    >
                      {issue.status === 1 ? t('open') : t('resolved')}
                    </span>

                    {canManage && (
                      <>
                        <button
                          onClick={() => handleToggleStatus(issue)}
                          title={issue.status === 1 ? t('resolve') : t('reopen')}
                          className="p-1.5 rounded-lg text-librarr-text-muted hover:text-librarr-success hover:bg-librarr-bg-lighter transition-colors"
                        >
                          {issue.status === 1 ? (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(issue)}
                          title={tc('delete')}
                          className="p-1.5 rounded-lg text-librarr-text-muted hover:text-librarr-danger hover:bg-librarr-bg-lighter transition-colors"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-8 text-center text-librarr-text-muted">
            <p>{t('noIssues')}</p>
          </div>
        )}
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('confirmDelete')}>
        <p className="text-sm text-librarr-text-muted mb-6">
          {t('confirmDeleteMessage')}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-librarr-text-muted hover:text-librarr-text transition-colors"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors"
          >
            {tc('delete')}
          </button>
        </div>
      </Modal>
    </>
  );
}
