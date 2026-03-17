import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost, apiPut, apiDelete, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import type { ServarrServer } from '../../types/api';

interface ServiceData {
  qualityProfiles: { id: number; name: string }[];
  metadataProfiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string; freeSpace: number }[];
  tags: { id: number; label: string }[];
}

const defaultForm = {
  name: '',
  hostname: '',
  port: 8787,
  apiKey: '',
  useSsl: false,
  baseUrl: '',
  activeProfileId: 0,
  activeDirectory: '',
  metadataProfileId: 0,
  tags: [] as number[],
  contentType: 'ebook' as 'ebook' | 'audiobook',
};

export default function ReadarrSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_READARR);
  const { settings } = useSettings();
  const { data: servers, mutate } = useSWR<ServarrServer[]>(hasAccess ? '/api/v1/settings/readarr' : null, fetcher);
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [serviceData, setServiceData] = useState<ServiceData | null>(null);
  const [loadingService, setLoadingService] = useState(false);
  const [serviceError, setServiceError] = useState(false);

  const isEditing = adding || editingId !== null;

  const fetchServiceData = (serverId: number) => {
    setLoadingService(true);
    setServiceError(false);
    fetcher(`/api/v1/service/readarr/${serverId}`)
      .then((data: ServiceData) => {
        setServiceData(data);
        setLoadingService(false);
      })
      .catch(() => {
        setServiceError(true);
        setLoadingService(false);
      });
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await apiPost<{ success: boolean }>('/settings/readarr/test', {
      ...form,
      serverId: editingId,
    });
    setTestResult(result.success);
  };

  const handleSave = async () => {
    if (editingId !== null) {
      const payload = { ...form };
      if (!payload.apiKey) delete (payload as Record<string, unknown>).apiKey;
      await apiPut(`/settings/readarr/${editingId}`, payload);
    } else {
      await apiPost('/settings/readarr', form);
    }
    mutate();
    handleCancel();
  };

  const handleEdit = (server: ServarrServer) => {
    setAdding(false);
    setForm({
      name: server.name || '',
      hostname: server.hostname || '',
      port: server.port || 8787,
      apiKey: '',
      useSsl: server.useSsl || false,
      baseUrl: server.baseUrl || '',
      activeProfileId: server.activeProfileId || 0,
      activeDirectory: server.activeDirectory || '',
      metadataProfileId: server.metadataProfileId || 0,
      tags: server.tags || [],
      contentType: (server.contentType || 'ebook') as 'ebook' | 'audiobook',
    });
    setTestResult(null);
    setEditingId(server.id);
    fetchServiceData(server.id);
  };

  const handleCancel = () => {
    setAdding(false);
    setEditingId(null);
    setTestResult(null);
    setForm(defaultForm);
    setServiceData(null);
    setServiceError(false);
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setTestResult(null);
    setForm(defaultForm);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('confirmDeleteServer'))) return;
    await apiDelete(`/settings/readarr/${id}`);
    mutate();
  };

  // Check if a content type slot is already taken (for the add form)
  const hasEbookServer = servers?.some((s) => (s.contentType || 'ebook') === 'ebook' && s.id !== editingId);
  const hasAudiobookServer = servers?.some((s) => (s.contentType || 'ebook') === 'audiobook' && s.id !== editingId);

  const renderFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('serverName')}</label>
          <input type="text" className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Readarr" />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('hostname')}</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 text-sm text-librarr-text-muted bg-librarr-bg-lighter/60 border border-r-0 border-librarr-bg-lighter rounded-l-lg select-none">
              {form.useSsl ? 'https://' : 'http://'}
            </span>
            <input type="text" className="input-field !rounded-l-none" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="localhost" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('port')}</label>
          <input type="number" className="input-field" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('apiKey')}</label>
          <input type="text" className="input-field" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editingId ? t('tokenPlaceholder') : 'API Key from Readarr'} />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('contentType')}</label>
          <div className="flex gap-4">
            <label className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${hasEbookServer && form.contentType !== 'ebook' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-librarr-bg-lighter/30 cursor-pointer'}`}>
              <input type="radio" name="contentType" value="ebook" checked={form.contentType === 'ebook'} onChange={() => setForm({ ...form, contentType: 'ebook' })} disabled={hasEbookServer && form.contentType !== 'ebook'} className="text-librarr-primary focus:ring-librarr-primary" />
              <span className="text-sm">{t('contentTypeEbook')}</span>
            </label>
            <label className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${hasAudiobookServer && form.contentType !== 'audiobook' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-librarr-bg-lighter/30 cursor-pointer'}`}>
              <input type="radio" name="contentType" value="audiobook" checked={form.contentType === 'audiobook'} onChange={() => setForm({ ...form, contentType: 'audiobook' })} disabled={hasAudiobookServer && form.contentType !== 'audiobook'} className="text-librarr-primary focus:ring-librarr-primary" />
              <span className="text-sm">{t('contentTypeAudiobook')}</span>
            </label>
          </div>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
            <input type="checkbox" checked={form.useSsl} onChange={(e) => setForm({ ...form, useSsl: e.target.checked })} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
            <span className="text-sm">{t('useSsl')}</span>
          </label>
        </div>
      </div>

      {/* Profiles, root folder, tags — only when editing an existing server */}
      {editingId !== null && (
        <div className="border-t border-librarr-bg-lighter pt-4">
          {loadingService ? (
            <p className="text-sm text-librarr-text-muted">{t('loadingProfiles')}</p>
          ) : serviceError ? (
            <p className="text-sm text-red-400">{t('profilesError')}</p>
          ) : serviceData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('qualityProfile')}</label>
                <select className="input-field" value={form.activeProfileId} onChange={(e) => setForm({ ...form, activeProfileId: parseInt(e.target.value) })}>
                  <option value={0} disabled>—</option>
                  {serviceData.qualityProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('metadataProfile')}</label>
                <select className="input-field" value={form.metadataProfileId} onChange={(e) => setForm({ ...form, metadataProfileId: parseInt(e.target.value) })}>
                  <option value={0} disabled>—</option>
                  {serviceData.metadataProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('rootFolder')}</label>
                <select className="input-field" value={form.activeDirectory} onChange={(e) => setForm({ ...form, activeDirectory: e.target.value })}>
                  <option value="" disabled>—</option>
                  {serviceData.rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>{f.path}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">{t('tags')}</label>
                {serviceData.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {serviceData.tags.map((tag) => {
                      const selected = form.tags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setForm({
                            ...form,
                            tags: selected ? form.tags.filter((t) => t !== tag.id) : [...form.tags, tag.id],
                          })}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            selected
                              ? 'bg-librarr-primary/20 text-librarr-primary-light border-librarr-primary/30'
                              : 'bg-librarr-bg-lighter/50 text-librarr-text-muted border-librarr-border hover:border-librarr-primary/30'
                          }`}
                        >
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-librarr-text-muted">{t('noTags')}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

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
        <title>{t('readarrTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">{t('readarrTitle')}</h1>
          {!isEditing && (
            <button
              onClick={startAdd}
              disabled={hasEbookServer && hasAudiobookServer}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('addServer')}
            </button>
          )}
        </div>

        {/* Server list */}
        {servers && servers.length > 0 ? (
          <div className="grid gap-3">
            {servers.map((server) => {
              const isBeingEdited = editingId === server.id;

              return (
                <div
                  key={server.id}
                  className={`card overflow-hidden transition-all duration-200 ${
                    isBeingEdited ? 'ring-2 ring-librarr-primary' : ''
                  }`}
                >
                  {/* Card header */}
                  <div className="p-5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{server.name || 'Readarr'}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${
                          (server.contentType || 'ebook') === 'ebook'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                        }`}>
                          {(server.contentType || 'ebook') === 'ebook' ? t('contentTypeEbook') : t('contentTypeAudiobook')}
                        </span>
                      </div>
                      <p className="text-sm text-librarr-text-muted mt-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                        </svg>
                        <code className="text-xs truncate">{server.useSsl ? 'https' : 'http'}://{server.hostname}:{server.port}</code>
                      </p>
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(server)}
                          className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-primary-light hover:bg-librarr-primary/10 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(server.id)}
                          className="p-2 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title={tc('delete')}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
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
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <p className="text-librarr-text-muted mb-4">{t('noServersReadarr')}</p>
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
            <div className="px-5 py-5 bg-librarr-bg/50">
              {renderFormFields()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
