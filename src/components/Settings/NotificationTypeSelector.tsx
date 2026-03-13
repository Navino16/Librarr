import React from 'react';
import { useTranslations } from 'next-intl';

const NOTIFICATION_TYPES = [
  { key: 'mediaPending', value: 1, group: 'requests' },
  { key: 'mediaApproved', value: 2, group: 'requests' },
  { key: 'mediaAvailable', value: 4, group: 'requests' },
  { key: 'mediaFailed', value: 8, group: 'requests' },
  { key: 'mediaDeclined', value: 16, group: 'requests' },
  { key: 'mediaAutoApproved', value: 32, group: 'requests' },
  { key: 'issueCreated', value: 64, group: 'issues' },
  { key: 'issueComment', value: 128, group: 'issues' },
  { key: 'issueResolved', value: 256, group: 'issues' },
  { key: 'issueReopened', value: 512, group: 'issues' },
] as const;

interface NotificationTypeSelectorProps {
  value: number;
  onChange: (value: number) => void;
  /** Bitmask of allowed notification types. If provided, only matching types are shown. */
  allowedTypes?: number;
}

export default function NotificationTypeSelector({
  value,
  onChange,
  allowedTypes,
}: NotificationTypeSelectorProps) {
  const t = useTranslations('notification');

  const toggle = (bitValue: number) => {
    onChange(value ^ bitValue);
  };

  const visibleTypes = allowedTypes != null
    ? NOTIFICATION_TYPES.filter((nt) => (allowedTypes & nt.value) === nt.value)
    : NOTIFICATION_TYPES;

  const requestTypes = visibleTypes.filter((nt) => nt.group === 'requests');
  const issueTypes = visibleTypes.filter((nt) => nt.group === 'issues');

  return (
    <div className="space-y-4">
      {requestTypes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-librarr-text-muted mb-2">
            {t('typeGroupRequests')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {requestTypes.map((nt) => (
              <label key={nt.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(value & nt.value) === nt.value}
                  onChange={() => toggle(nt.value)}
                  className="rounded"
                />
                <span>{t(`type_${nt.key}`)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {issueTypes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-librarr-text-muted mb-2">
            {t('typeGroupIssues')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {issueTypes.map((nt) => (
              <label key={nt.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(value & nt.value) === nt.value}
                  onChange={() => toggle(nt.value)}
                  className="rounded"
                />
                <span>{t(`type_${nt.key}`)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
