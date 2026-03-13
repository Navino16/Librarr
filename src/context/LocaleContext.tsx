import React, { createContext, useContext, useState, useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useUser } from './UserContext';

const SUPPORTED_LOCALES = ['en', 'fr'];
const DEFAULT_LOCALE = 'en';

interface LocaleContextType {
  locale: string;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: DEFAULT_LOCALE,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Record<string, unknown> | null>(
    null
  );

  const targetLocale = SUPPORTED_LOCALES.includes(
    user?.settings?.locale ?? ''
  )
    ? user!.settings!.locale
    : DEFAULT_LOCALE;

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      try {
        const mod = await import(`../messages/${targetLocale}.json`);
        if (!cancelled) {
          setMessages(mod.default);
          setLocale(targetLocale);
        }
      } catch {
        const fallback = await import('../messages/en.json');
        if (!cancelled) {
          setMessages(fallback.default);
          setLocale(DEFAULT_LOCALE);
        }
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [targetLocale]);

  if (!messages) {
    return (
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  return (
    <LocaleContext.Provider value={{ locale }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export default LocaleContext;
