import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost } from '../../hooks/useApi';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { settings, isLoading } = useSettings();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = useTranslations('auth');

  useEffect(() => {
    if (!isLoading && !settings?.smtpConfigured) {
      router.replace('/login');
    }
  }, [isLoading, settings?.smtpConfigured, router]);

  if (isLoading || !settings?.smtpConfigured) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiPost('/auth/reset-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t('forgotPassword')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-librarr-primary mb-2">
              {settings?.appTitle || 'Librarr'}
            </h1>
            <p className="text-librarr-text-muted">{t('forgotPasswordDescription')}</p>
          </div>

          <div className="card p-6">
            {submitted ? (
              <div className="text-center">
                <div className="mb-4 p-3 bg-librarr-success/10 border border-librarr-success/20 rounded-lg text-librarr-success text-sm">
                  {t('resetLinkSent')}
                </div>
                <Link
                  href="/login"
                  className="text-sm text-librarr-text-muted hover:text-librarr-primary transition-colors"
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
                    <label htmlFor="email" className="block text-sm font-medium text-librarr-text-muted mb-1">
                      {t('email')}
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {loading ? t('sending') : t('sendResetLink')}
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
