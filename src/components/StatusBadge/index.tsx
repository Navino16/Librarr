import React from 'react';
import { useTranslations } from 'next-intl';

interface StatusBadgeProps {
  status: number;
  className?: string;
}

const statusConfig: Record<number, { labelKey: string; color: string }> = {
  1: { labelKey: 'unknown', color: 'bg-gray-500' },
  2: { labelKey: 'pending', color: 'bg-yellow-500' },
  3: { labelKey: 'processing', color: 'bg-librarr-primary' },
  4: { labelKey: 'partiallyAvailable', color: 'bg-librarr-accent' },
  5: { labelKey: 'available', color: 'bg-librarr-success' },
  6: { labelKey: 'deleted', color: 'bg-librarr-danger' },
  7: { labelKey: 'declined', color: 'bg-librarr-danger' },
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig[1];
  const t = useTranslations('status');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${config.color} ${className}`}
    >
      {t(config.labelKey)}
    </span>
  );
}
