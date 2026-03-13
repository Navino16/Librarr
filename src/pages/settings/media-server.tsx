import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import {
  defaultJellyfinForm,
  defaultPlexForm,
  defaultAudiobookshelfForm,
  typeConfig,
  getUseSsl,
  getHostname,
  getPort,
  formatUrl,
} from '../../components/Settings/mediaServerConfig';
import { ServerIcon, ServerIconSmall, EditIcon, DeleteIcon } from '../../components/Settings/mediaServerIcons';

interface JellyfinData {
  hostname: string;
  port?: number;
  useSsl: boolean;
  baseUrl?: string;
  serverId?: string;
  apiKey?: string;
}

interface PlexData {
  hostname: string;
  port: number;
  useSsl: boolean;
  token?: string;
  machineId?: string;
}

interface AudiobookshelfData {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

type ServerType = 'jellyfin' | 'plex' | 'audiobookshelf';

export default function MediaServerSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS);
  const { settings } = useSettings();
  const { data: jellyfinData, mutate: mutateJellyfin } = useSWR<JellyfinData>(
    hasAccess ? '/api/v1/settings/jellyfin' : null,
    fetcher
  );
  const { data: plexData, mutate: mutatePlex } = useSWR<PlexData>(
    hasAccess ? '/api/v1/settings/plex' : null,
    fetcher
  );
  const { data: absData, mutate: mutateAbs } = useSWR<AudiobookshelfData>(
    hasAccess ? '/api/v1/settings/audiobookshelf' : null,
    fetcher
  );
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [adding, setAdding] = useState(false);
  const [editingType, setEditingType] = useState<ServerType | null>(null);
  const [serverType, setServerType] = useState<ServerType>('jellyfin');
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [jellyfinForm, setJellyfinForm] = useState(defaultJellyfinForm);
  const [plexForm, setPlexForm] = useState(defaultPlexForm);
  const [absForm, setAbsForm] = useState(defaultAudiobookshelfForm);

  const isEditing = adding || editingType !== null;

  const jellyfinConfigured = !!jellyfinData?.hostname;
  const plexConfigured = !!plexData?.hostname;
  const absConfigured = !!absData?.hostname;
  const hasServers = jellyfinConfigured || plexConfigured || absConfigured;

  const handleTest = async () => {
    setTestResult(null);
    const endpoints: Record<ServerType, string> = {
      jellyfin: '/settings/jellyfin/test',
      plex: '/settings/plex/test',
      audiobookshelf: '/settings/audiobookshelf/test',
    };
    const bodies: Record<ServerType, unknown> = {
      jellyfin: jellyfinForm,
      plex: plexForm,
      audiobookshelf: absForm,
    };
    const result = await apiPost<{ success: boolean }>(endpoints[serverType], bodies[serverType]);
    setTestResult(result.success);
  };

  const handleSave = async () => {
    if (serverType === 'jellyfin') {
      await apiPost('/settings/jellyfin', jellyfinForm);
      mutateJellyfin();
    } else if (serverType === 'plex') {
      const payload = { ...plexForm };
      if (editingType && !payload.token) delete (payload as Record<string, unknown>).token;
      await apiPost('/settings/plex', payload);
      mutatePlex();
    } else {
      const payload = { ...absForm };
      if (editingType && !payload.apiKey) delete (payload as Record<string, unknown>).apiKey;
      await apiPost('/settings/audiobookshelf', payload);
      mutateAbs();
    }
    handleCancel();
  };

  const handleEdit = (type: ServerType) => {
    setServerType(type);
    setTestResult(null);
    if (type === 'jellyfin' && jellyfinData) {
      setJellyfinForm({
        hostname: jellyfinData.hostname || '',
        port: jellyfinData.port || 8096,
        useSsl: jellyfinData.useSsl || false,
        baseUrl: jellyfinData.baseUrl || '',
        apiKey: jellyfinData.apiKey || '',
      });
    } else if (type === 'plex' && plexData) {
      setPlexForm({
        hostname: plexData.hostname || '',
        port: plexData.port || 32400,
        useSsl: plexData.useSsl || false,
        token: plexData.token || '',
      });
    } else if (type === 'audiobookshelf' && absData) {
      setAbsForm({
        hostname: absData.hostname || '',
        port: absData.port || 13378,
        useSsl: absData.useSsl || false,
        apiKey: absData.apiKey || '',
        baseUrl: absData.baseUrl || '',
      });
    }
    setEditingType(type);
    setAdding(false);
  };

  const handleDelete = async (type: ServerType) => {
    if (!confirm(t('deleteServer'))) return;
    if (type === 'jellyfin') {
      await apiPost('/settings/jellyfin', { hostname: '', port: undefined, useSsl: false, baseUrl: '', serverId: undefined });
      mutateJellyfin();
    } else if (type === 'plex') {
      await apiPost('/settings/plex', { hostname: '', port: 32400, useSsl: false, token: '', machineId: undefined });
      mutatePlex();
    } else {
      await apiPost('/settings/audiobookshelf', { hostname: '', port: 13378, apiKey: '', useSsl: false, baseUrl: '' });
      mutateAbs();
    }
  };

  const handleCancel = () => {
    setAdding(false);
    setEditingType(null);
    setTestResult(null);
    setJellyfinForm(defaultJellyfinForm);
    setPlexForm(defaultPlexForm);
    setAbsForm(defaultAudiobookshelfForm);
  };

  const startAdd = () => {
    setEditingType(null);
    setAdding(true);
    setServerType('jellyfin');
    setTestResult(null);
    setJellyfinForm(defaultJellyfinForm);
    setPlexForm(defaultPlexForm);
    setAbsForm(defaultAudiobookshelfForm);
  };

  const setHostname = (value: string) => {
    if (serverType === 'jellyfin') setJellyfinForm({ ...jellyfinForm, hostname: value });
    else if (serverType === 'plex') setPlexForm({ ...plexForm, hostname: value });
    else setAbsForm({ ...absForm, hostname: value });
  };

  const setPort = (value: number) => {
    if (serverType === 'jellyfin') setJellyfinForm({ ...jellyfinForm, port: value });
    else if (serverType === 'plex') setPlexForm({ ...plexForm, port: value });
    else setAbsForm({ ...absForm, port: value });
  };

  const setSsl = (value: boolean) => {
    if (serverType === 'jellyfin') setJellyfinForm({ ...jellyfinForm, useSsl: value });
    else if (serverType === 'plex') setPlexForm({ ...plexForm, useSsl: value });
    else setAbsForm({ ...absForm, useSsl: value });
  };

  const currentUseSsl = getUseSsl(serverType, jellyfinForm, plexForm, absForm);
  const currentHostname = getHostname(serverType, jellyfinForm, plexForm, absForm);
  const currentPort = getPort(serverType, jellyfinForm, plexForm, absForm);

  const typeButtons: { type: ServerType; labelKey: string; activeClass: string }[] = [
    { type: 'jellyfin', labelKey: 'mediaServerTypeJellyfin', activeClass: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40' },
    { type: 'plex', labelKey: 'mediaServerTypePlex', activeClass: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' },
    { type: 'audiobookshelf', labelKey: 'mediaServerTypeAudiobookshelf', activeClass: 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40' },
  ];

  const servers: { type: ServerType; configured: boolean; label: string; url: string }[] = [
    {
      type: 'jellyfin',
      configured: jellyfinConfigured,
      label: 'Jellyfin',
      url: jellyfinData ? formatUrl(jellyfinData.useSsl ? 'https' : 'http', jellyfinData.hostname, jellyfinData.port, jellyfinData.baseUrl) : '',
    },
    {
      type: 'plex',
      configured: plexConfigured,
      label: 'Plex',
      url: plexData ? formatUrl(plexData.useSsl ? 'https' : 'http', plexData.hostname, plexData.port) : '',
    },
    {
      type: 'audiobookshelf',
      configured: absConfigured,
      label: 'Audiobookshelf',
      url: absData ? formatUrl(absData.useSsl ? 'https' : 'http', absData.hostname, absData.port, absData.baseUrl) : '',
    },
  ];

  const renderFormFields = () => (
    <div className="space-y-4">
      {/* Form fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {t('hostname')}
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 text-sm text-librarr-text-muted bg-librarr-bg-lighter/60 border border-r-0 border-librarr-bg-lighter rounded-l-lg select-none">
              {currentUseSsl ? 'https://' : 'http://'}
            </span>
            <input
              type="text"
              className="input-field !rounded-l-none"
              value={currentHostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="localhost"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {t('port')}
          </label>
          <input
            type="number"
            className="input-field"
            value={currentPort}
            onChange={(e) => setPort(parseInt(e.target.value))}
          />
        </div>
        {serverType === 'plex' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
              {t('plexToken')}
            </label>
            <input
              type="text"
              className="input-field"
              value={plexForm.token}
              onChange={(e) => setPlexForm({ ...plexForm, token: e.target.value })}
              placeholder={editingType ? t('tokenPlaceholder') : 'X-Plex-Token'}
            />
            <p className="text-xs text-librarr-text-muted mt-1">
              {t('plexTokenHelp')}
            </p>
          </div>
        )}
        {serverType === 'jellyfin' && (
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
              {t('jellyfinApiKey')}
            </label>
            <input
              type="text"
              className="input-field"
              value={jellyfinForm.apiKey}
              onChange={(e) => setJellyfinForm({ ...jellyfinForm, apiKey: e.target.value })}
              placeholder={editingType ? t('tokenPlaceholder') : 'API Key'}
            />
            <p className="text-xs text-librarr-text-muted mt-1">
              {t('jellyfinApiKeyHint')}
            </p>
          </div>
        )}
        {serverType === 'audiobookshelf' && (
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
              {t('apiKey')}
            </label>
            <input
              type="text"
              className="input-field"
              value={absForm.apiKey}
              onChange={(e) => setAbsForm({ ...absForm, apiKey: e.target.value })}
              placeholder={editingType ? t('tokenPlaceholder') : 'API Key'}
            />
          </div>
        )}
        {(serverType === 'jellyfin' || serverType === 'audiobookshelf') && (
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
              Base URL
            </label>
            <input
              type="text"
              className="input-field"
              value={serverType === 'jellyfin' ? jellyfinForm.baseUrl : absForm.baseUrl}
              onChange={(e) =>
                serverType === 'jellyfin'
                  ? setJellyfinForm({ ...jellyfinForm, baseUrl: e.target.value })
                  : setAbsForm({ ...absForm, baseUrl: e.target.value })
              }
              placeholder={serverType === 'jellyfin' ? '/jellyfin' : '/audiobookshelf'}
            />
          </div>
        )}
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={currentUseSsl}
              onChange={(e) => setSsl(e.target.checked)}
              className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
            />
            <span className="text-sm">{t('useSsl')}</span>
          </label>
        </div>
      </div>

      {/* Test result */}
      {testResult !== null && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
          testResult
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {testResult ? <path d="M20 6L9 17l-5-5" /> : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
          </svg>
          {testResult ? t('connectionSuccess') : t('connectionFailed')}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={handleTest} className="btn-secondary flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {t('testConnection')}
        </button>
        <button onClick={handleSave} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
          {tc('save')}
        </button>
        <button onClick={handleCancel} className="btn-secondary">
          {tc('cancel')}
        </button>
      </div>
    </div>
  );

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>{t('mediaServerTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">{t('mediaServerTitle')}</h1>
          {!isEditing && (
            <button
              onClick={startAdd}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('addServer')}
            </button>
          )}
        </div>

        {/* Server list */}
        {hasServers ? (
          <div className="grid gap-3">
            {servers.filter((s) => s.configured).map((server) => {
              const isBeingEdited = editingType === server.type;

              return (
                <div
                  key={server.type}
                  className={`card overflow-hidden transition-all duration-200 ${
                    isBeingEdited ? 'ring-2 ring-librarr-primary' : ''
                  }`}
                >
                  {/* Card header */}
                  <div className="p-5 flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${typeConfig[server.type].color}`}>
                      <ServerIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{server.label}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${typeConfig[server.type].badgeBg}`}>
                          {server.label}
                        </span>
                      </div>
                      <p className="text-sm text-librarr-text-muted mt-0.5 flex items-center gap-1.5">
                        <ServerIconSmall />
                        <code className="text-xs truncate">{server.url}</code>
                      </p>
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(server.type)}
                          className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-primary-light hover:bg-librarr-primary/10 transition-colors"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => handleDelete(server.type)}
                          className="p-2 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title={tc('delete')}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expandable inline edit panel */}
                  {isBeingEdited && (
                    <div className="border-t border-librarr-bg-lighter px-5 py-5 bg-librarr-bg/50">
                      {renderFormFields()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : !isEditing ? (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-librarr-text-muted mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <p className="text-librarr-text-muted mb-4">{t('noMediaServers')}</p>
            <button onClick={startAdd} className="btn-primary">
              {t('addServer')}
            </button>
          </div>
        ) : null}

        {/* Add server card (separate, at the bottom) */}
        {adding && (
          <div className="card overflow-hidden ring-2 ring-librarr-primary mt-4">
            <div className="flex items-center gap-3 p-5 border-b border-librarr-bg-lighter">
              <div className="w-10 h-10 rounded-lg bg-librarr-primary/20 text-librarr-primary-light flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="font-semibold text-base">{t('addServer')}</span>
            </div>
            <div className="px-5 py-5 bg-librarr-bg/50 space-y-4">
              {/* Server type selector */}
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
                  {t('mediaServerType')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {typeButtons.map((btn) => (
                    <button
                      key={btn.type}
                      onClick={() => { setServerType(btn.type); setTestResult(null); }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        serverType === btn.type
                          ? btn.activeClass
                          : 'bg-librarr-bg-lighter/50 text-librarr-text-muted hover:bg-librarr-bg-lighter'
                      }`}
                    >
                      {t(btn.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              {renderFormFields()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
