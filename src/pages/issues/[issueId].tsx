import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useUser } from '../../context/UserContext';
import { useLocale } from '../../context/LocaleContext';
import { fetcher, apiPost, apiPut, apiDelete } from '../../hooks/useApi';
import { Permission, hasPermission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import CoverImage from '../../components/Common/CoverImage';
import type { IssueDetail } from '../../types/api';
import { issueTypeKeys } from '../../constants/issues';

export default function IssueDetailPage() {
  const router = useRouter();
  const { issueId } = router.query;
  const { user } = useUser();
  const { settings } = useSettings();
  const { locale } = useLocale();
  const t = useTranslations('issues');
  const tc = useTranslations('common');

  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const { data: issue, isLoading, mutate } = useSWR<IssueDetail>(
    issueId ? `/api/v1/issue/${issueId}` : null,
    fetcher
  );

  const canManage = hasPermission(user?.permissions ?? 0, Permission.MANAGE_ISSUES);
  const isCreator = issue?.createdBy?.id === user?.id;
  const canComment = isCreator || canManage ||
    hasPermission(user?.permissions ?? 0, Permission.VIEW_ISSUES);

  const handleToggleStatus = async () => {
    if (!issue) return;
    const newStatus = issue.status === 1 ? 2 : 1;
    await apiPut(`/issue/${issue.id}`, { status: newStatus });
    mutate();
  };

  const handleDeleteIssue = async () => {
    if (!issue) return;
    await apiDelete(`/issue/${issue.id}`);
    router.push('/issues');
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !issue) return;
    setSending(true);
    try {
      await apiPost('/issueComment', { issueId: issue.id, message: commentText.trim() });
      setCommentText('');
      mutate();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendComment();
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!issue) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{t('issueNotFound')}</p>
      </div>
    );
  }

  const item = issue.work
    ? { title: issue.work.title, coverUrl: issue.work.coverUrl, href: `/book/${issue.work.hardcoverId}` }
    : issue.musicAlbum
      ? { title: issue.musicAlbum.title, coverUrl: issue.musicAlbum.coverUrl, href: `/music/${issue.musicAlbum.musicBrainzId}` }
      : null;

  return (
    <>
      <Head>
        <title>
          {t('issueNumber', { id: issue.id, type: t(issueTypeKeys[issue.issueType] || 'other') })}
          {' - '}{settings?.appTitle || 'Librarr'}
        </title>
      </Head>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/issues" className="text-sm text-librarr-text-muted hover:text-librarr-text transition-colors mb-2 inline-block">
            &larr; {t('title')}
          </Link>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold">
              {t('issueNumber', { id: issue.id, type: t(issueTypeKeys[issue.issueType] || 'other') })}
            </h1>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium text-white shrink-0 ${
                issue.status === 1 ? 'bg-librarr-warning' : 'bg-librarr-success'
              }`}
            >
              {issue.status === 1 ? t('open') : t('resolved')}
            </span>
          </div>
          <p className="text-sm text-librarr-text-muted mt-1">
            {t('byUser', { username: issue.createdBy?.username ?? '', date: new Date(issue.createdAt).toLocaleDateString(locale) })}
          </p>
        </div>

        {/* Media item card */}
        {item && (
          <Link href={item.href} className="card p-4 flex items-center gap-4 mb-6 hover:bg-librarr-bg-light/50 transition-colors">
            <div className="relative shrink-0 w-12 h-16 rounded overflow-hidden bg-librarr-bg-lighter">
              <CoverImage
                src={item.coverUrl ?? ''}
                alt={item.title}
                sizes="48px"
                className="object-cover"
              />
            </div>
            <span className="font-medium text-librarr-primary">{item.title}</span>
          </Link>
        )}


        {/* Actions */}
        {canManage && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={handleToggleStatus}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                issue.status === 1
                  ? 'bg-librarr-success hover:bg-librarr-success/80'
                  : 'bg-librarr-warning hover:bg-librarr-warning/80'
              }`}
            >
              {issue.status === 1 ? t('resolve') : t('reopen')}
            </button>
            <button
              onClick={handleDeleteIssue}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-danger text-white hover:bg-librarr-danger/80 transition-colors"
            >
              {tc('delete')}
            </button>
          </div>
        )}

        {/* Comments */}
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('comments')}</h2>

          {issue.comments && issue.comments.length > 0 ? (
            <div className="space-y-3 mb-4">
              {issue.comments.map((comment) => (
                <div key={comment.id} className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">{comment.user?.username}</span>
                    <span className="text-xs text-librarr-text-muted">
                      {new Date(comment.createdAt).toLocaleDateString(locale, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-librarr-text whitespace-pre-wrap">{comment.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-librarr-text-muted mb-4">{t('noComments')}</p>
          )}

          {/* Comment input */}
          {canComment && (
            <div className="card p-4">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('addComment')}
                rows={3}
                maxLength={5000}
                className="w-full rounded-lg border border-librarr-bg-lighter bg-librarr-bg-light text-librarr-text px-3 py-2 text-sm focus:border-librarr-primary focus:outline-none resize-y mb-3"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSendComment}
                  disabled={sending || !commentText.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  {sending ? t('sending') : t('send')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}
