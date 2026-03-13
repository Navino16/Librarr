import React from 'react';
import { apiPost } from '../../hooks/useApi';
import { HostnameField, TestResultBanner, SavedServerCard } from './components';
import { StepNavigation } from './StepNavigation';
import { readarrDefaults } from './constants';
import type { SavedReadarr } from './constants';

interface Step5ReadarrProps {
  form: SavedReadarr;
  setForm: (f: SavedReadarr) => void;
  servers: SavedReadarr[];
  setServers: (s: SavedReadarr[]) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  testResult: boolean | null;
  setTestResult: (v: boolean | null) => void;
  testLoading: boolean;
  setTestLoading: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  t: (key: string) => string;
  ts: (key: string) => string;
  tc: (key: string) => string;
}

const isPortValid = (port: number) => Number.isFinite(port) && port >= 1 && port <= 65535;

export const Step5Readarr: React.FC<Step5ReadarrProps> = ({
  form,
  setForm,
  servers,
  setServers,
  showForm,
  setShowForm,
  testResult,
  setTestResult,
  testLoading,
  setTestLoading,
  onNext,
  onBack,
  t,
  ts,
  tc,
}) => {
  const handleAdd = () => {
    if (!form.hostname || !form.apiKey) return;
    if (!isPortValid(form.port)) return;
    setServers([...servers, { ...form }]);
    setForm({ ...readarrDefaults });
    setShowForm(false);
    setTestResult(null);
  };

  const handleRemove = (index: number) => {
    const remaining = servers.filter((_, i) => i !== index);
    setServers(remaining);
    if (remaining.length === 0) setShowForm(true);
  };

  const handleTest = async () => {
    setTestResult(null);
    setTestLoading(true);
    try {
      const result = await apiPost<{ success: boolean }>('/settings/readarr/test', form);
      setTestResult(result.success);
    } catch {
      setTestResult(false);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold">{t('readarrTitle')}</h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-librarr-bg-lighter text-librarr-text-muted">
            {t('optional')}
          </span>
        </div>
        <p className="text-librarr-text-muted text-sm">{t('readarrDescription')}</p>
      </div>

      {/* Saved servers list */}
      {servers.length > 0 && (
        <div className="space-y-2">
          {servers.map((server, idx) => (
            <SavedServerCard
              key={idx}
              name={server.name || `Readarr ${idx + 1}`}
              badge={server.contentType}
              hostname={server.hostname}
              port={server.port}
              useSsl={server.useSsl}
              onRemove={() => handleRemove(idx)}
            />
          ))}
        </div>
      )}

      {/* Form */}
      {showForm ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('serverName')}
              </label>
              <input
                type="text"
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Readarr"
              />
            </div>
            <HostnameField
              label={ts('hostname')}
              value={form.hostname}
              useSsl={form.useSsl}
              onChange={(v) => setForm({ ...form, hostname: v })}
            />
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('port')}
              </label>
              <input
                type="number"
                className="input-field"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('apiKey')}
              </label>
              <input
                type="text"
                className="input-field"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="API Key from Readarr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('rootFolder')}
              </label>
              <input
                type="text"
                className="input-field"
                value={form.activeDirectory}
                onChange={(e) => setForm({ ...form, activeDirectory: e.target.value })}
                placeholder="/books"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('contentType')}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="readarrContentType"
                    value="ebook"
                    checked={form.contentType === 'ebook'}
                    onChange={() => setForm({ ...form, contentType: 'ebook' })}
                    className="text-librarr-primary focus:ring-librarr-primary"
                  />
                  <span className="text-sm">{ts('contentTypeEbook')}</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="readarrContentType"
                    value="audiobook"
                    checked={form.contentType === 'audiobook'}
                    onChange={() => setForm({ ...form, contentType: 'audiobook' })}
                    className="text-librarr-primary focus:ring-librarr-primary"
                  />
                  <span className="text-sm">{ts('contentTypeAudiobook')}</span>
                </label>
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useSsl}
                  onChange={(e) => setForm({ ...form, useSsl: e.target.checked })}
                  className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
                />
                <span className="text-sm">{ts('useSsl')}</span>
              </label>
            </div>
          </div>

          <TestResultBanner testResult={testResult} successLabel={ts('connectionSuccess')} failedLabel={ts('connectionFailed')} />

          {/* Form actions */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={handleTest} disabled={testLoading} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
              {testLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              {testLoading ? ts('testing') : ts('testConnection')}
            </button>
            <div className="flex items-center gap-2">
              {servers.length > 0 && (
                <button
                  onClick={() => {
                    setShowForm(false);
                    setTestResult(null);
                  }}
                  className="btn-secondary"
                >
                  {tc('cancel')}
                </button>
              )}
              <button
                onClick={handleAdd}
                disabled={!form.hostname || !form.apiKey}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {tc('save')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('addAnother')}
        </button>
      )}

      <StepNavigation onBack={onBack} onNext={onNext} showSkip t={tc} skipLabel={t('skip')} />
    </div>
  );
};
