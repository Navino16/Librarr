import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';
import { useUser } from '../../context/UserContext';
import { fetcher, apiPost, apiDelete } from '../../hooks/useApi';
import { useHasPermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import Modal from '../../components/Common/Modal';
import type { UserSummary, PermissionRole } from '../../types/api';
import { userTypeLabels } from '../../constants/userTypes';

export default function UsersPage() {
  const { settings } = useSettings();
  const { locale } = useLocale();
  const { user: currentUser } = useUser();
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data: usersResponse, isLoading, mutate } = useSWR<{ results: UserSummary[]; pageInfo: { pages: number; page: number; results: number } }>(`/api/v1/user?take=${pageSize}&skip=${page * pageSize}`, fetcher);
  const users = usersResponse?.results;
  const t = useTranslations('profile');
  const tn = useTranslations('nav');
  const ts = useTranslations('setup');
  const tu = useTranslations('users');
  const tc = useTranslations('common');
  const canManageUsers = useHasPermission(Permission.MANAGE_USERS);
  const { data: roles } = useSWR<PermissionRole[]>(
    canManageUsers ? '/api/v1/settings/roles' : null,
    fetcher
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  };

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleClose = () => {
    setModalOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(ts('passwordMinLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(ts('passwordsDoNotMatch'));
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/user', { email, username, password });
      await mutate();
      handleClose();
      showFeedback(tu('userCreated'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : tc('error');
      if (message.includes('409') || message.toLowerCase().includes('already exists')) {
        setError(tu('emailExists'));
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: number, roleId: string) => {
    if (roleId === 'custom') return;
    const role = roles?.find((p) => p.id === Number(roleId));
    if (!role) return;
    setUpdatingUserId(userId);
    try {
      await apiPost(`/user/${userId}/settings/permissions`, {
        permissions: role.permissions,
      });
      await mutate();
      showFeedback(tu('permissionsUpdated'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : tc('error');
      showFeedback(message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/user/${deleteTarget.id}`);
      await mutate();
      setDeleteTarget(null);
      showFeedback(tu('userDeleted'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : tc('error');
      setDeleteTarget(null);
      showFeedback(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Head>
        <title>{tn('users')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{tn('users')}</h1>
          {canManageUsers && (
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => setModalOpen(true)}
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
              {tu('createUser')}
            </button>
          )}
        </div>

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

        {isLoading ? (
          <LoadingSpinner />
        ) : users && users.length > 0 ? (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-librarr-bg-lighter text-left text-sm text-librarr-text-muted">
                  <th className="px-4 py-3">{t('user')}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">{t('email')}</th>
                  <th className="px-4 py-3">{t('typeLabel')}</th>
                  {canManageUsers && roles && (
                    <th className="px-4 py-3 hidden md:table-cell">{tu('role')}</th>
                  )}
                  <th className="px-4 py-3 hidden lg:table-cell">{tu('requests')}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">{t('created')}</th>
                  {canManageUsers && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-librarr-bg-lighter/50 hover:bg-librarr-bg-lighter/30"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/users/${user.id}`} className="flex items-center gap-3 hover:text-librarr-primary transition-colors">
                        <div className="w-8 h-8 rounded-full bg-librarr-primary flex items-center justify-center text-sm font-bold text-white">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.username}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-librarr-text-muted hidden sm:table-cell">
                      {user.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {userTypeLabels[user.userType] || 'Unknown'}
                    </td>
                    {canManageUsers && roles && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        {currentUser?.id === user.id ? (
                          <span className="text-sm text-librarr-text-muted">
                            {roles.find((p) => p.permissions === user.permissions)?.name ?? tu('custom')}
                          </span>
                        ) : (
                          <select
                            className="input-field text-sm py-1.5 px-2 max-w-[160px]"
                            value={
                              roles.find((p) => p.permissions === user.permissions)?.id ?? 'custom'
                            }
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={updatingUserId === user.id}
                          >
                            {roles
                              .filter((p) => {
                                // Only admins see the Admin role option
                                if (p.permissions === Permission.ADMIN) {
                                  return currentUser && (currentUser.permissions & Permission.ADMIN) !== 0;
                                }
                                return true;
                              })
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            {!roles.find((p) => p.permissions === user.permissions) && (
                              <option value="custom">{tu('custom')}</option>
                            )}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-librarr-text-muted hidden lg:table-cell">
                      {user.requestCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-librarr-text-muted hidden sm:table-cell">
                      {new Date(user.createdAt).toLocaleDateString(locale)}
                    </td>
                    {canManageUsers && (
                      <td className="px-4 py-3 text-right">
                        {currentUser?.id !== user.id && (
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-2 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title={tc('delete')}
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
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card p-8 text-center text-librarr-text-muted">
            <p>{tu('noUsers')}</p>
          </div>
        )}

        {/* Pagination */}
        {usersResponse && usersResponse.pageInfo.pages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tc('back')}
            </button>
            <span className="text-sm text-librarr-text-muted">
              {page + 1} / {usersResponse.pageInfo.pages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= usersResponse.pageInfo.pages}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tc('next')}
            </button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={handleClose} title={tu('createUser')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-librarr-danger/10 border border-librarr-danger/20 rounded-lg text-librarr-danger text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1">
              {ts('username')}
            </label>
            <input
              type="text"
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1">
              {ts('email')}
            </label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1">
              {ts('password')}
            </label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={ts('minChars')}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1">
              {ts('confirmPassword')}
            </label>
            <input
              type="password"
              className="input-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={ts('repeatPassword')}
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
            >
              {tc('cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting}
            >
              {submitting ? tc('loading') : tu('createUser')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={tc('delete')}
      >
        <div className="space-y-4">
          <p className="text-sm text-librarr-text-muted">
            {tu('confirmDelete', { username: deleteTarget?.username ?? '' })}
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              className="btn-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              {tc('cancel')}
            </button>
            <button
              className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? tc('loading') : tc('delete')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
