import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../../context/SettingsContext';
import { apiPost } from '../../../hooks/useApi';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { guid } = router.query;
  const { settings } = useSettings();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    if (!guid || typeof guid !== 'string') {
      setError('Invalid reset link');
      return;
    }

    setLoading(true);

    try {
      await apiPost(`/auth/reset-password/${guid}`, { password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t('resetPassword')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-librarr-primary mb-2">
              {settings?.appTitle || 'Librarr'}
            </h1>
            <p className="text-librarr-text-muted">{t('resetPasswordDescription')}</p>
          </div>

          <div className="card p-6">
            {success ? (
              <div className="text-center">
                <div className="mb-4 p-3 bg-librarr-success/10 border border-librarr-success/20 rounded-lg text-librarr-success text-sm">
                  {t('passwordResetSuccess')}
                </div>
                <Link
                  href="/login"
                  className="text-sm text-librarr-primary hover:text-librarr-primary/80 transition-colors font-medium"
                >
                  {t('backToSignIn')}
                </Link>
              </div>
            ) : (
              <>
                <div role="alert" aria-live="assertive">
                  {error && (
                    <div className="mb-4 p-3 bg-librarr-danger/10 border border-librarr-danger/20 rounded-lg text-librarr-danger text-sm">
                      {error}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-librarr-text-muted mb-1">
                      {t('newPassword')}
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field"
                      placeholder={tc('minChars')}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-librarr-text-muted mb-1">
                      {tc('confirmPassword')}
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field"
                      placeholder={tc('repeatPassword')}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {loading ? t('resetting') : t('resetPassword')}
                  </button>
                </form>
                <div className="mt-4 text-center">
                  <Link
                    href="/login"
                    className="text-sm text-librarr-text-muted hover:text-librarr-primary transition-colors"
                  >
                    {t('backToSignIn')}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
