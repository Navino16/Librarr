import React from 'react';
import { apiPost } from '../../hooks/useApi';
import { HostnameField, TestResultBanner, SavedServerCard } from './components';
import { StepNavigation } from './StepNavigation';
import { jellyfinDefaults, plexDefaults, absDefaults } from './constants';
import type { ServerType, SavedMediaServer } from './constants';

interface Step4MediaServersProps {
  mediaServerType: ServerType;
  setMediaServerType: (type: ServerType) => void;
  jellyfinForm: typeof jellyfinDefaults;
  setJellyfinForm: (form: typeof jellyfinDefaults) => void;
  plexForm: typeof plexDefaults;
  setPlexForm: (form: typeof plexDefaults) => void;
  absForm: typeof absDefaults;
  setAbsForm: (form: typeof absDefaults) => void;
  mediaServers: SavedMediaServer[];
  setMediaServers: (servers: SavedMediaServer[]) => void;
  showMediaServerForm: boolean;
  setShowMediaServerForm: (v: boolean) => void;
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

const mediaServerTypeOptions = [
  { type: 'jellyfin' as ServerType, label: 'mediaServerTypeJellyfin', activeClass: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40' },
  { type: 'plex' as ServerType, label: 'mediaServerTypePlex', activeClass: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' },
  { type: 'audiobookshelf' as ServerType, label: 'mediaServerTypeAudiobookshelf', activeClass: 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40' },
];

const isPortValid = (port: number) => Number.isFinite(port) && port >= 1 && port <= 65535;

const getMediaServerLabel = (type: ServerType) => {
  if (type === 'jellyfin') return 'Jellyfin';
  if (type === 'plex') return 'Plex';
  return 'Audiobookshelf';
};

export const Step4MediaServers: React.FC<Step4MediaServersProps> = ({
  mediaServerType,
  setMediaServerType,
  jellyfinForm,
  setJellyfinForm,
  plexForm,
  setPlexForm,
  absForm,
  setAbsForm,
  mediaServers,
  setMediaServers,
  showMediaServerForm,
  setShowMediaServerForm,
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
  const getForm = () => {
    if (mediaServerType === 'jellyfin') return jellyfinForm;
    if (mediaServerType === 'plex') return plexForm;
    return absForm;
  };

  const configuredMediaTypes = mediaServers.map((s) => s.type);

  const handleAdd = () => {
    const form = getForm();
    if (!form.hostname) return;
    if (form.port && !isPortValid(form.port)) return;
    setMediaServers([...mediaServers, {
      type: mediaServerType,
      label: getMediaServerLabel(mediaServerType),
      form: { ...form },
      hostname: form.hostname,
      port: form.port,
      useSsl: form.useSsl,
    }]);
    if (mediaServerType === 'jellyfin') setJellyfinForm({ ...jellyfinDefaults });
    else if (mediaServerType === 'plex') setPlexForm({ ...plexDefaults });
    else setAbsForm({ ...absDefaults });
    setShowMediaServerForm(false);
    setTestResult(null);

    const nextAvailable = mediaServerTypeOptions.find(
      (o) => o.type !== mediaServerType && !configuredMediaTypes.includes(o.type)
    );
    if (nextAvailable) setMediaServerType(nextAvailable.type);
  };

  const handleRemove = (index: number) => {
    const remaining = mediaServers.filter((_, i) => i !== index);
    setMediaServers(remaining);
    if (remaining.length === 0) setShowMediaServerForm(true);
  };

  const handleTest = async () => {
    setTestResult(null);
    setTestLoading(true);
    try {
      const result = await apiPost<{ success: boolean }>(
        `/settings/${mediaServerType}/test`,
        getForm()
      );
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
          <h2 className="text-lg font-semibold">{t('mediaServerTitle')}</h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-librarr-bg-lighter text-librarr-text-muted">
            {t('optional')}
          </span>
        </div>
        <p className="text-librarr-text-muted text-sm">
          {t('mediaServerDescription')}
        </p>
      </div>

      {/* Saved servers list */}
      {mediaServers.length > 0 && (
        <div className="space-y-2">
          {mediaServers.map((server, idx) => (
            <SavedServerCard
              key={idx}
              name={server.label}
              hostname={server.hostname}
              port={server.port}
              useSsl={server.useSsl}
              onRemove={() => handleRemove(idx)}
            />
          ))}
        </div>
      )}

      {/* Form */}
      {showMediaServerForm ? (
        <>
          {/* Server type selector */}
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
              {ts('mediaServerType')}
            </label>
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={ts('mediaServerType')}>
              {mediaServerTypeOptions.map((btn) => {
                const isDisabled = configuredMediaTypes.includes(btn.type);
                return (
                  <button
                    key={btn.type}
                    role="radio"
                    aria-checked={mediaServerType === btn.type}
                    onClick={() => !isDisabled && setMediaServerType(btn.type)}
                    disabled={isDisabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isDisabled
                        ? 'bg-librarr-bg-lighter/30 text-librarr-text-muted/40 cursor-not-allowed'
                        : mediaServerType === btn.type
                          ? btn.activeClass
                          : 'bg-librarr-bg-lighter/50 text-librarr-text-muted hover:bg-librarr-bg-lighter'
                    }`}
                  >
                    {ts(btn.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HostnameField
              label={ts('hostname')}
              value={
                mediaServerType === 'jellyfin'
                  ? jellyfinForm.hostname
                  : mediaServerType === 'plex'
                    ? plexForm.hostname
                    : absForm.hostname
              }
              useSsl={
                mediaServerType === 'jellyfin'
                  ? jellyfinForm.useSsl
                  : mediaServerType === 'plex'
                    ? plexForm.useSsl
                    : absForm.useSsl
              }
              onChange={(v) => {
                if (mediaServerType === 'jellyfin')
                  setJellyfinForm({ ...jellyfinForm, hostname: v });
                else if (mediaServerType === 'plex')
                  setPlexForm({ ...plexForm, hostname: v });
                else setAbsForm({ ...absForm, hostname: v });
              }}
            />
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                {ts('port')}
              </label>
              <input
                type="number"
                className="input-field"
                value={
                  mediaServerType === 'jellyfin'
                    ? jellyfinForm.port
                    : mediaServerType === 'plex'
                      ? plexForm.port
                      : absForm.port
                }
                onChange={(e) => {
                  const port = parseInt(e.target.value);
                  if (mediaServerType === 'jellyfin')
                    setJellyfinForm({ ...jellyfinForm, port });
                  else if (mediaServerType === 'plex')
                    setPlexForm({ ...plexForm, port });
                  else setAbsForm({ ...absForm, port });
                }}
              />
            </div>
            {mediaServerType === 'plex' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {ts('plexToken')}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={plexForm.token}
                  onChange={(e) => setPlexForm({ ...plexForm, token: e.target.value })}
                  placeholder="X-Plex-Token"
                />
                <p className="text-xs text-librarr-text-muted mt-1">
                  {ts('plexTokenHelp')}
                </p>
              </div>
            )}
            {mediaServerType === 'audiobookshelf' && (
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {ts('apiKey')}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={absForm.apiKey}
                  onChange={(e) => setAbsForm({ ...absForm, apiKey: e.target.value })}
                  placeholder="API Key"
                />
              </div>
            )}
            {(mediaServerType === 'jellyfin' || mediaServerType === 'audiobookshelf') && (
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {tc('baseUrl')}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={
                    mediaServerType === 'jellyfin'
                      ? jellyfinForm.baseUrl
                      : absForm.baseUrl
                  }
                  onChange={(e) =>
                    mediaServerType === 'jellyfin'
                      ? setJellyfinForm({ ...jellyfinForm, baseUrl: e.target.value })
                      : setAbsForm({ ...absForm, baseUrl: e.target.value })
                  }
                  placeholder={
                    mediaServerType === 'jellyfin' ? '/jellyfin' : '/audiobookshelf'
                  }
                />
              </div>
            )}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    mediaServerType === 'jellyfin'
                      ? jellyfinForm.useSsl
                      : mediaServerType === 'plex'
                        ? plexForm.useSsl
                        : absForm.useSsl
                  }
                  onChange={(e) => {
                    if (mediaServerType === 'jellyfin')
                      setJellyfinForm({ ...jellyfinForm, useSsl: e.target.checked });
                    else if (mediaServerType === 'plex')
                      setPlexForm({ ...plexForm, useSsl: e.target.checked });
                    else setAbsForm({ ...absForm, useSsl: e.target.checked });
                  }}
                  className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
                />
                <span className="text-sm">{ts('useSsl')}</span>
              </label>
            </div>
          </div>

          <TestResultBanner testResult={testResult} successLabel={ts('connectionSuccess')} failedLabel={ts('connectionFailed')} />

          {/* Form actions: Test + Cancel/Save */}
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
              {mediaServers.length > 0 && (
                <button
                  onClick={() => {
                    setShowMediaServerForm(false);
                    setTestResult(null);
                  }}
                  className="btn-secondary"
                >
                  {tc('cancel')}
                </button>
              )}
              <button
                onClick={handleAdd}
                disabled={!getForm().hostname}
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
        /* Add Another button (only if not all 3 types configured) */
        configuredMediaTypes.length < 3 && (
          <button
            onClick={() => setShowMediaServerForm(true)}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('addAnother')}
          </button>
        )
      )}

      <StepNavigation onBack={onBack} onNext={onNext} showSkip t={tc} skipLabel={t('skip')} />
    </div>
  );
};
