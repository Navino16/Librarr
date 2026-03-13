import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost, apiPut, apiDelete, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';

interface OidcProviderForm {
  name: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  autoCreateUsers: boolean;
}

const emptyProvider: OidcProviderForm = {
  name: '',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid email profile',
  autoCreateUsers: false,
};

export default function AuthSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_GENERAL);
  const { settings: publicSettings, mutate: mutatePublic } = useSettings();
  const { data: mainSettings, mutate: mutateMain } = useSWR(hasAccess ? '/api/v1/settings/main' : null, fetcher);
  const { data: plexAuth, mutate: mutatePlex } = useSWR(hasAccess ? '/api/v1/settings/plex-auth' : null, fetcher);
  const { data: oidcProviders, mutate: mutateOidc } = useSWR(hasAccess ? '/api/v1/settings/oidc-providers' : null, fetcher);

  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // OIDC provider form state
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<OidcProviderForm>(emptyProvider);

  if (!hasAccess) return null;
  if (!mainSettings) return null;

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleToggle = async (field: string, value: boolean) => {
    setSaving(true);
    setSaveError('');
    try {
      await apiPost('/settings/main', { [field]: value });
      mutateMain();
      mutatePublic();
      showSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePlexToggle = async (field: string, value: boolean) => {
    setSaving(true);
    setSaveError('');
    try {
      await apiPost('/settings/plex-auth', { [field]: value });
      mutatePlex();
      showSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddProvider = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await apiPost('/settings/oidc-providers', providerForm);
      mutateOidc();
      mutatePublic();
      setShowAddProvider(false);
      setProviderForm(emptyProvider);
      showSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProvider = async (id: string) => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: Record<string, unknown> = {
        name: providerForm.name,
        issuerUrl: providerForm.issuerUrl,
        clientId: providerForm.clientId,
        scopes: providerForm.scopes,
        autoCreateUsers: providerForm.autoCreateUsers,
      };
      if (providerForm.clientSecret) {
        payload.clientSecret = providerForm.clientSecret;
      }
      await apiPut(`/settings/oidc-providers/${id}`, payload);
      mutateOidc();
      mutatePublic();
      setEditingProvider(null);
      setProviderForm(emptyProvider);
      showSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm(t('confirmDeleteProvider'))) return;
    try {
      await apiDelete(`/settings/oidc-providers/${id}`);
      mutateOidc();
      mutatePublic();
      showSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tc('error'));
    }
  };

  const startEdit = (provider: Record<string, unknown>) => {
    setEditingProvider(provider.id as string);
    setProviderForm({
      name: provider.name as string,
      issuerUrl: provider.issuerUrl as string,
      clientId: provider.clientId as string,
      clientSecret: '',
      scopes: provider.scopes as string,
      autoCreateUsers: provider.autoCreateUsers as boolean,
    });
    setShowAddProvider(false);
  };

  const cancelForm = () => {
    setEditingProvider(null);
    setShowAddProvider(false);
    setProviderForm(emptyProvider);
  };

  const getCallbackUrl = (providerId: string) => {
    const base = (mainSettings?.applicationUrl as string)?.replace(/\/+$/, '') || window.location.origin;
    return `${base}/api/v1/auth/oidc/${providerId}/callback`;
  };

  const copyCallbackUrl = async (providerId: string) => {
    await navigator.clipboard.writeText(getCallbackUrl(providerId));
    setCopiedId(providerId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderProviderForm = (isEdit: boolean, id?: string) => (
    <div className="p-4 border border-librarr-border rounded-lg space-y-3 bg-librarr-bg/50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1">{t('providerName')}</label>
          <input type="text" className="input-field" value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} placeholder="e.g. Authelia" />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1">{t('issuerUrl')}</label>
          <input type="text" className="input-field" value={providerForm.issuerUrl} onChange={(e) => setProviderForm({ ...providerForm, issuerUrl: e.target.value })} placeholder="https://auth.example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1">{t('clientId')}</label>
          <input type="text" className="input-field" value={providerForm.clientId} onChange={(e) => setProviderForm({ ...providerForm, clientId: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1">{t('clientSecret')}</label>
          <input type="password" className="input-field" value={providerForm.clientSecret} onChange={(e) => setProviderForm({ ...providerForm, clientSecret: e.target.value })} placeholder={isEdit ? t('tokenPlaceholder') : ''} />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1">{t('scopes')}</label>
          <input type="text" className="input-field" value={providerForm.scopes} onChange={(e) => setProviderForm({ ...providerForm, scopes: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={providerForm.autoCreateUsers} onChange={(e) => setProviderForm({ ...providerForm, autoCreateUsers: e.target.checked })} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
        <span className="text-sm">{t('autoCreateUsers')}</span>
      </label>
      <div className="flex gap-2 pt-2">
        <button onClick={isEdit ? () => handleUpdateProvider(id!) : handleAddProvider} disabled={saving || !providerForm.name || !providerForm.issuerUrl || !providerForm.clientId || (!isEdit && !providerForm.clientSecret)} className="btn-primary text-sm disabled:opacity-50">
          {saving ? tc('loading') : tc('save')}
        </button>
        <button onClick={cancelForm} className="btn-secondary text-sm">{tc('cancel')}</button>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{t('authTitle')} - {publicSettings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{t('authTitle')}</h1>

        {saved && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            {tc('settingsSaved')}
          </div>
        )}
        {saveError && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{saveError}</div>
        )}

        {/* Local Authentication */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-librarr-primary/15 text-librarr-primary-light flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('localAuthSection')}</h2>
            </div>
          </div>
          <div className="p-5">
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input type="checkbox" checked={mainSettings?.localLogin ?? true} onChange={(e) => handleToggle('localLogin', e.target.checked)} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
              <span className="text-sm">{t('enableLocalLogin')}</span>
            </label>
          </div>
        </div>

        {/* Plex Authentication */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#e5a00d]/15 text-[#e5a00d] flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('plexAuthSection')}</h2>
            </div>
          </div>
          <div className="p-5 space-y-1">
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input type="checkbox" checked={mainSettings?.plexLogin ?? false} onChange={(e) => handleToggle('plexLogin', e.target.checked)} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
              <span className="text-sm">{t('enablePlexLogin')}</span>
            </label>
            {mainSettings?.plexLogin && plexAuth && (
              <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
                <input type="checkbox" checked={plexAuth.autoCreateUsers ?? false} onChange={(e) => handlePlexToggle('autoCreateUsers', e.target.checked)} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
                <span className="text-sm">{t('autoCreateUsers')}</span>
              </label>
            )}
          </div>
        </div>

        {/* OIDC Authentication */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="font-semibold">{t('oidcAuthSection')}</h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
              <input type="checkbox" checked={mainSettings?.oidcLogin ?? false} onChange={(e) => handleToggle('oidcLogin', e.target.checked)} className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary" />
              <span className="text-sm">{t('enableOidcLogin')}</span>
            </label>

            {mainSettings?.oidcLogin && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{t('oidcProviders')}</h3>
                  {!showAddProvider && !editingProvider && (
                    <button onClick={() => { setShowAddProvider(true); setProviderForm(emptyProvider); }} className="btn-primary text-sm">
                      {t('addProvider')}
                    </button>
                  )}
                </div>

                {showAddProvider && renderProviderForm(false)}

                {Array.isArray(oidcProviders) && oidcProviders.length > 0 ? (
                  <div className="space-y-3">
                    {oidcProviders.map((p: Record<string, unknown>) => (
                      <div key={p.id as string}>
                        {editingProvider === p.id ? (
                          renderProviderForm(true, p.id as string)
                        ) : (
                          <div className="p-4 border border-librarr-border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{p.name as string}</div>
                                <div className="text-xs text-librarr-text-muted mt-0.5">{p.issuerUrl as string}</div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => startEdit(p)} className="text-sm text-librarr-primary hover:underline">{t('editRole')}</button>
                                <button onClick={() => handleDeleteProvider(p.id as string)} className="text-sm text-librarr-danger hover:underline">{tc('delete')}</button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 bg-librarr-bg-lighter/50 rounded px-3 py-1.5">
                              <span className="text-xs text-librarr-text-muted shrink-0">{t('callbackUrl')}:</span>
                              <code className="text-xs text-librarr-text break-all flex-1">{getCallbackUrl(p.id as string)}</code>
                              <button
                                onClick={() => copyCallbackUrl(p.id as string)}
                                className="text-xs text-librarr-primary hover:text-librarr-primary-light shrink-0"
                                title={t('callbackUrl')}
                              >
                                {copiedId === p.id ? t('copiedToClipboard') : (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !showAddProvider ? (
                  <p className="text-sm text-librarr-text-muted">{t('noProviders')}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
