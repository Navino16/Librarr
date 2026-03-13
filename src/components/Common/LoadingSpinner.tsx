import { useTranslations } from 'next-intl';

export default function LoadingSpinner() {
  const tc = useTranslations('common');

  return (
    <div className="flex justify-center py-12" role="status" aria-label={tc('loading')}>
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-librarr-primary" />
      <span className="sr-only">{tc('loading')}</span>
    </div>
  );
}
