import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import { fetcher, apiPost } from '../../hooks/useApi';
import { channelAgentConfig, clientServerConfig } from '../../components/Settings/notificationConfig';
import NotificationTypeSelector from '../../components/Settings/NotificationTypeSelector';

interface NotificationAgentConfig {
  enabled: boolean;
  types: number;
  options: Record<string, string>;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  senderAddress: string;
  senderName: string;
  requireTls: boolean;
  allowSelfSigned: boolean;
}

interface NotificationSettingsData {
  agents: Record<string, NotificationAgentConfig>;
  smtp?: SmtpConfig;
}

const IMPLEMENTED_CHANNEL_AGENTS = ['discord', 'webhook'];
const IMPLEMENTED_CLIENT_AGENTS = ['email'];

const defaultSmtp: SmtpConfig = {
  host: '',
  port: 587,
  secure: false,
  authUser: '',
  authPass: '',
  senderAddress: '',
  senderName: 'Librarr',
  requireTls: false,
  allowSelfSigned: false,
};

export default function NotificationSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_NOTIFICATIONS);
  const { settings } = useSettings();
  const t = useTranslations('settings');
  const tn = useTranslations('notification');
  const tc = useTranslations('common');

  const { data, mutate } = useSWR<NotificationSettingsData>(
    hasAccess ? '/api/v1/settings/notifications' : null,
    fetcher
  );

  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [types, setTypes] = useState(0);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [smtp, setSmtp] = useState<SmtpConfig>(defaultSmtp);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingAgent && data) {
      const agentData = data.agents[editingAgent];
      if (agentData) {
        setEnabled(agentData.enabled);
        setTypes(agentData.types);
        setOptions(agentData.options || {});
      } else {
        setEnabled(false);
        setTypes(0);
        setOptions({});
      }
      if (editingAgent === 'email' && data.smtp) {
        setSmtp(data.smtp);
      } else {
        setSmtp(defaultSmtp);
      }
      setTestResult(null);
      setError('');
    }
  }, [editingAgent, data]);

  const handleEdit = (key: string) => {
    if (editingAgent === key) {
      setEditingAgent(null);
    } else {
      setEditingAgent(key);
    }
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setTestResult(null);
    setError('');
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    setSaving(true);
    setError('');
    try {
      await apiPost(`/settings/notifications/${editingAgent}`, {
        enabled,
        types,
        options,
      });

      if (editingAgent === 'email') {
        await apiPost('/settings/notifications/smtp/config', smtp);
      }

      mutate();
      setEditingAgent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!editingAgent) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiPost<{ success: boolean }>(
        `/settings/notifications/${editingAgent}/test`,
        editingAgent === 'email' ? { recipientEmail: smtp.senderAddress } : {}
      );
      setTestResult(result.success);
    } catch {
      setTestResult(false);
    } finally {
      setTesting(false);
    }
  };

  const renderChannelFields = (agentId: string) => {
    if (agentId === 'discord') {
      return (
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('webhookUrl')}
          </label>
          <input
            type="url"
            className="input-field"
            placeholder="https://discord.com/api/webhooks/..."
            value={options.webhookUrl || ''}
            onChange={(e) => setOptions({ ...options, webhookUrl: e.target.value })}
          />
        </div>
      );
    }

    if (agentId === 'webhook') {
      return (
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('webhookUrl')}
          </label>
          <input
            type="url"
            className="input-field"
            placeholder="https://example.com/webhook"
            value={options.webhookUrl || ''}
            onChange={(e) => setOptions({ ...options, webhookUrl: e.target.value })}
          />
        </div>
      );
    }

    return null;
  };

  const renderSmtpFields = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('smtpHost')}
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="smtp.example.com"
            value={smtp.host}
            onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('smtpPort')}
          </label>
          <input
            type="number"
            className="input-field"
            value={smtp.port}
            onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('smtpUser')}
          </label>
          <input
            type="text"
            className="input-field"
            value={smtp.authUser}
            onChange={(e) => setSmtp({ ...smtp, authUser: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('smtpPass')}
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="********"
            value={smtp.authPass}
            onChange={(e) => setSmtp({ ...smtp, authPass: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('senderAddress')}
          </label>
          <input
            type="email"
            className="input-field"
            placeholder="noreply@example.com"
            value={smtp.senderAddress}
            onChange={(e) => setSmtp({ ...smtp, senderAddress: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
            {tn('senderName')}
          </label>
          <input
            type="text"
            className="input-field"
            value={smtp.senderName}
            onChange={(e) => setSmtp({ ...smtp, senderName: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smtp.secure}
            onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
            className="rounded"
          />
          SSL/TLS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smtp.requireTls}
            onChange={(e) => setSmtp({ ...smtp, requireTls: e.target.checked })}
            className="rounded"
          />
          {tn('requireTls')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smtp.allowSelfSigned}
            onChange={(e) => setSmtp({ ...smtp, allowSelfSigned: e.target.checked })}
            className="rounded"
          />
          {tn('allowSelfSigned')}
        </label>
      </div>
    </div>
  );

  const renderAgentCard = (
    { key, icon: Icon, color }: { key: string; icon: React.FC; color: string },
    isImplemented: boolean,
    isChannel: boolean
  ) => {
    const agentData = data?.agents[key];
    const isEnabled = agentData?.enabled || false;
    const isBeingEdited = editingAgent === key;

    return (
      <div
        key={key}
        className={`card overflow-hidden transition-all duration-200 ${
          isBeingEdited ? 'ring-2 ring-librarr-primary' : ''
        }`}
      >
        {/* Card header */}
        <div className="p-5 flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{tn(key)}</h3>
              {isEnabled && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                  {tn('enabled')}
                </span>
              )}
              {!isImplemented && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {t('musicComingSoon')}
                </span>
              )}
            </div>
            <p className="text-sm text-librarr-text-muted mt-0.5">
              {tn(`${key}Description`)}
            </p>
          </div>
          {isImplemented && editingAgent !== key && (
            <button
              onClick={() => handleEdit(key)}
              className="p-2 rounded-lg text-librarr-text-muted hover:text-librarr-primary-light hover:bg-librarr-primary/10 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>

        {/* Expandable inline edit panel */}
        {isBeingEdited && (
          <div className="border-t border-librarr-bg-lighter px-5 py-5 bg-librarr-bg/50">
            <div className="space-y-4">
              {/* Enable toggle */}
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">{tn('enableAgent')}</span>
              </label>

              {/* Agent-specific fields */}
              {isChannel ? renderChannelFields(key) : renderSmtpFields()}

              {/* Notification types — only for channel agents */}
              {isChannel && (
                <div>
                  <h3 className="text-sm font-medium mb-2">{tn('notificationTypes')}</h3>
                  <NotificationTypeSelector value={types} onChange={setTypes} />
                </div>
              )}

              {error && (
                <p className="text-sm text-librarr-danger">{error}</p>
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
                  {testResult ? tn('testSuccess') : tn('testFailed')}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="btn-secondary flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {testing ? tn('testSending') : tn('testButton')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  {saving ? tc('loading') : tc('save')}
                </button>
                <button onClick={handleCancel} className="btn-secondary">
                  {tc('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>{t('notificationTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{t('notificationTitle')}</h1>

        {/* Channel Agents section */}
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold">{tn('channelAgents')}</h2>
                <p className="text-xs text-librarr-text-muted">{tn('channelAgentsDescription')}</p>
              </div>
            </div>
          </div>
          <div className="p-4 grid gap-3">
            {channelAgentConfig.map((agent) =>
              renderAgentCard(agent, IMPLEMENTED_CHANNEL_AGENTS.includes(agent.key), true)
            )}
          </div>
        </div>

        {/* Client Agent Server Configuration section */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold">{tn('clientServerConfig')}</h2>
                <p className="text-xs text-librarr-text-muted">{tn('clientServerConfigDescription')}</p>
              </div>
            </div>
          </div>
          <div className="p-4 grid gap-3">
            {clientServerConfig.map((agent) =>
              renderAgentCard(agent, IMPLEMENTED_CLIENT_AGENTS.includes(agent.key), false)
            )}
          </div>
        </div>
      </div>
    </>
  );
}
