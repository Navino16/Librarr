import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import Modal from '../Common/Modal';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useUser } from '../../context/UserContext';
import { Permission, hasPermission } from '../../constants/permissions';
import { issueTypeKeys } from '../../constants/issues';

interface IssueModalProps {
  open: boolean;
  onClose: () => void;
  workId?: number;
  musicAlbumId?: number;
  onSuccess?: () => void;
}

const ISSUE_TYPES = [1, 2, 3, 4, 5] as const;

export default function IssueModal({
  open,
  onClose,
  workId,
  musicAlbumId,
  onSuccess,
}: IssueModalProps) {
  const t = useTranslations('issueModal');
  const ti = useTranslations('issues');
  const [issueType, setIssueType] = useState<number>(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { issueType };
      if (message.trim()) body.message = message.trim();
      if (workId) body.workId = workId;
      else if (musicAlbumId) body.musicAlbumId = musicAlbumId;

      await apiPost('/issue', body);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-5">
        <div>
          <label htmlFor="issue-type-select" className="block text-sm font-medium text-librarr-text-muted mb-2">
            {t('selectType')}
          </label>
          <select
            id="issue-type-select"
            value={issueType}
            onChange={(e) => setIssueType(Number(e.target.value))}
            className="input-field w-full"
          >
            {ISSUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {ti(issueTypeKeys[type])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="issue-message" className="block text-sm font-medium text-librarr-text-muted mb-2">
            {t('messageLabel')}
          </label>
          <textarea
            id="issue-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-librarr-bg-lighter bg-librarr-bg-light text-librarr-text px-3 py-2 text-sm focus:border-librarr-primary focus:outline-none resize-y"
          />
        </div>

        {error && (
          <p className="text-librarr-danger text-sm">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-librarr-text-muted hover:text-librarr-text transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ReportIssueButton({
  workId,
  musicAlbumId,
}: {
  workId?: number;
  musicAlbumId?: number;
}) {
  const { user } = useUser();
  const t = useTranslations('issueModal');
  const ti = useTranslations('issues');
  const [open, setOpen] = useState(false);

  const canCreate = hasPermission(user?.permissions ?? 0, Permission.CREATE_ISSUES);
  const canView = hasPermission(user?.permissions ?? 0, Permission.VIEW_ISSUES);

  const countKey = canView
    ? workId
      ? `/api/v1/issue/count/work/${workId}`
      : musicAlbumId
        ? `/api/v1/issue/count/music/${musicAlbumId}`
        : null
    : null;

  const { data: countData, mutate } = useSWR<{ open: number }>(countKey, fetcher);
  const openCount = countData?.open ?? 0;

  if (!canCreate && !openCount) return null;
  if (!workId && !musicAlbumId) return null;

  return (
    <div className="flex items-center gap-3">
      {canCreate && (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-librarr-text-muted hover:text-librarr-danger bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {t('reportIssue')}
        </button>
      )}

      {openCount > 0 && (
        <Link
          href="/issues?filter=open"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-librarr-warning bg-librarr-warning/10 hover:bg-librarr-warning/20 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {ti('openIssueCount', { count: openCount })}
        </Link>
      )}

      {canCreate && (
        <IssueModal
          open={open}
          onClose={() => setOpen(false)}
          workId={workId}
          musicAlbumId={musicAlbumId}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}
