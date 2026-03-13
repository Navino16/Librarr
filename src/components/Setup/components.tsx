import React from 'react';

// Hostname input with protocol prefix
export const HostnameField = ({
  value,
  useSsl,
  onChange,
  label,
}: {
  value: string;
  useSsl: boolean;
  onChange: (v: string) => void;
  label: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
      {label}
    </label>
    <div className="flex">
      <span className="inline-flex items-center px-3 text-sm text-librarr-text-muted bg-librarr-bg-lighter/60 border border-r-0 border-librarr-bg-lighter rounded-l-lg select-none">
        {useSsl ? 'https://' : 'http://'}
      </span>
      <input
        type="text"
        className="input-field !rounded-l-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="localhost"
        aria-label={label}
      />
    </div>
  </div>
);

// Test result display
export const TestResultBanner = ({
  testResult,
  successLabel,
  failedLabel,
}: {
  testResult: boolean | null;
  successLabel: string;
  failedLabel: string;
}) => {
  if (testResult === null) return null;
  return (
    <div
      className={`px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
        testResult
          ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
      }`}
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {testResult ? (
          <path d="M20 6L9 17l-5-5" />
        ) : (
          <>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </>
        )}
      </svg>
      {testResult ? successLabel : failedLabel}
    </div>
  );
};

// SavedServerCard — compact card for saved servers
export const SavedServerCard = ({
  name,
  badge,
  hostname,
  port,
  useSsl,
  onRemove,
}: {
  name: string;
  badge?: string;
  hostname: string;
  port: number;
  useSsl: boolean;
  onRemove: () => void;
}) => (
  <div className="flex items-center justify-between bg-librarr-bg rounded-lg px-4 py-3">
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{name}</span>
        {badge && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-librarr-primary/15 text-librarr-primary-light">
            {badge}
          </span>
        )}
      </div>
      <code className="text-xs text-librarr-text-muted">
        {useSsl ? 'https' : 'http'}://{hostname}:{port}
      </code>
    </div>
    <button
      onClick={onRemove}
      aria-label={`Remove ${name}`}
      className="p-1.5 text-librarr-text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
);
