import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function Custom404() {
  const t = useTranslations('errors');

  return (
    <>
      <Head>
        <title>404 - Librarr</title>
      </Head>
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-librarr-text mb-4">404</h1>
          <p className="text-xl text-librarr-text-muted mb-8">
            {t('pageNotFound')}
          </p>
          <Link href="/" className="btn-primary">
            {t('goHome')}
          </Link>
        </div>
      </div>
    </>
  );
}
