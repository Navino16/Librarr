import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { SWRConfig } from 'swr';
import { UserProvider, useUser } from '../context/UserContext';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import { ToastProvider } from '../context/ToastContext';
import ErrorBoundary from '../components/ErrorBoundary';
import Layout from '../components/Layout';
import '../styles/globals.css';

const publicPages = ['/login', '/setup', '/resetpassword'];

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { locale } = useLocale();

  // Keep document lang in sync with active locale
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (userLoading || settingsLoading || !router.isReady) {
    return (
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  // Redirect to setup if not initialized
  if (settings && !settings.initialized && router.pathname !== '/setup') {
    router.replace('/setup');
    return null;
  }

  // Redirect to login if not authenticated on protected pages
  const isPublicPage = publicPages.some((p) => router.pathname.startsWith(p));
  if (!user && !isPublicPage && settings?.initialized) {
    router.replace(`/login?returnUrl=${encodeURIComponent(router.asPath)}`);
    return null;
  }

  // Public pages (login, setup) render without layout
  if (isPublicPage || !user) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

export default function App(props: AppProps) {
  return (
    <ErrorBoundary>
      <SWRConfig value={{ revalidateOnFocus: false }}>
        <SettingsProvider>
          <UserProvider>
            <LocaleProvider>
              <ToastProvider>
                <AppContent {...props} />
              </ToastProvider>
            </LocaleProvider>
          </UserProvider>
        </SettingsProvider>
      </SWRConfig>
    </ErrorBoundary>
  );
}
