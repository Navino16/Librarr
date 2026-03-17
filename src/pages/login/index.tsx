import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUser } from '../../context/UserContext';
import { useSettings } from '../../context/SettingsContext';
import { apiPost } from '../../hooks/useApi';
import Logo from '../../components/Common/Logo';

function safeReturnUrl(url: unknown): string {
  if (typeof url !== 'string') return '/';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

export default function LoginPage() {
  const router = useRouter();
  const { mutate } = useUser();
  const { settings } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [plexLoading, setPlexLoading] = useState(false);
  const plexPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useTranslations('auth');

  const showLocalForm =
    settings?.localLogin || router.query.localAuth === 'true';
  const showPlex = settings?.plexLogin;
  const showOidc = settings?.oidcLogin && (settings?.oidcProviders?.length ?? 0) > 0;
  const hasMultipleMethods =
    [showLocalForm, showPlex, showOidc].filter(Boolean).length > 1;

  // Show error from query params (e.g. OIDC callback errors)
  useEffect(() => {
    if (router.query.error === 'oidc_no_account') {
      setError(t('noAccountFound'));
    } else if (router.query.error === 'oidc_failed') {
      setError(t('oidcFailed'));
    }
  }, [router.query.error, t]);

  // Cleanup Plex polling on unmount
  useEffect(() => {
    return () => {
      if (plexPollRef.current) clearInterval(plexPollRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiPost('/auth/local', { email, password });
      mutate();
      router.push(safeReturnUrl(router.query.returnUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePlexLogin = useCallback(async () => {
    setError('');
    setPlexLoading(true);

    try {
      const pin = await apiPost<{
        id: number;
        code: string;
        clientId: string;
        authUrl: string;
      }>('/auth/plex');

      // Open Plex auth in popup
      const popup = window.open(
        pin.authUrl,
        'PlexAuth',
        'width=800,height=600,scrollbars=yes'
      );

      // Poll for PIN completion
      plexPollRef.current = setInterval(async () => {
        try {
          const result = await apiPost<{
            authenticated: boolean;
            user?: unknown;
            error?: string;
          }>('/auth/plex/poll', { pinId: pin.id, clientId: pin.clientId });

          if (result.authenticated) {
            if (plexPollRef.current) clearInterval(plexPollRef.current);
            plexPollRef.current = null;
            if (popup && !popup.closed) popup.close();
            setPlexLoading(false);
            mutate();
            const returnUrl =
              typeof router.query.returnUrl === 'string'
                ? router.query.returnUrl
                : '/';
            router.push(returnUrl);
          }
        } catch (err) {
          if (plexPollRef.current) clearInterval(plexPollRef.current);
          plexPollRef.current = null;
          setPlexLoading(false);
          setError(
            err instanceof Error ? err.message : 'Plex authentication failed'
          );
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (plexPollRef.current) {
          clearInterval(plexPollRef.current);
          plexPollRef.current = null;
          setPlexLoading(false);
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      setPlexLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to start Plex login');
    }
  }, [mutate, router]);

  const handleOidcLogin = (providerId: string) => {
    const returnUrl =
      typeof router.query.returnUrl === 'string'
        ? router.query.returnUrl
        : '/';
    window.location.href = `/api/v1/auth/oidc/${providerId}/authorize?returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <>
      <Head>
        <title>
          {t('signIn')} - {settings?.appTitle || 'Librarr'}
        </title>
      </Head>
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <Logo size="lg" className="mb-2" />
            <p className="text-librarr-text-muted">{t('signInToAccount')}</p>
          </div>

          <div className="card p-6">
            <div role="alert" aria-live="assertive">
              {error && (
                <div className="mb-4 p-3 bg-librarr-danger/10 border border-librarr-danger/20 rounded-lg text-librarr-danger text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Admin access badge when local login is disabled */}
            {!settings?.localLogin && router.query.localAuth === 'true' && (
              <div className="mb-4 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs text-center">
                {t('adminAccess')}
              </div>
            )}

            {/* Local login form */}
            {showLocalForm && (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-librarr-text-muted mb-1"
                    >
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
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-librarr-text-muted mb-1"
                    >
                      {t('password')}
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field"
                      placeholder={t('password')}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {loading ? t('signingIn') : t('signIn')}
                  </button>
                </form>
                {settings?.smtpConfigured && (
                  <div className="mt-3 text-center">
                    <Link
                      href="/login/forgot-password"
                      className="text-sm text-librarr-text-muted hover:text-librarr-primary transition-colors"
                    >
                      {t('forgotPassword')}
                    </Link>
                  </div>
                )}
              </>
            )}

            {/* Divider between methods */}
            {showLocalForm && hasMultipleMethods && (
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 border-t border-librarr-border" />
                <span className="text-sm text-librarr-text-muted">{t('or')}</span>
                <div className="flex-1 border-t border-librarr-border" />
              </div>
            )}

            {/* External auth buttons */}
            {(showPlex || showOidc) && (
              <div className="space-y-3">
                {showPlex && (
                  <button
                    onClick={handlePlexLogin}
                    disabled={plexLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-[#e5a00d] hover:bg-[#cc8f0b] disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
                    </svg>
                    {plexLoading ? t('signingInWithPlex') : t('signInWithPlex')}
                  </button>
                )}

                {showOidc &&
                  settings?.oidcProviders?.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleOidcLogin(provider.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      {t('signInWith', { provider: provider.name })}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
