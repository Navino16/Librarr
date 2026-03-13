import React from 'react';
import type { SavedMediaServer, SavedReadarr, SavedLidarr } from './constants';

interface Step7ConfirmProps {
  formData: { username: string; email: string };
  requestTypes: { ebook: boolean; audiobook: boolean; music: boolean };
  hardcoverToken: string;
  mediaServers: SavedMediaServer[];
  readarrServers: SavedReadarr[];
  lidarrServers: SavedLidarr[];
  loading: boolean;
  onBack: () => void;
  onFinalize: () => void;
  t: (key: string) => string;
  ts: (key: string) => string;
  tc: (key: string) => string;
}

export const Step7Confirm: React.FC<Step7ConfirmProps> = ({
  formData,
  requestTypes,
  hardcoverToken,
  mediaServers,
  readarrServers,
  lidarrServers,
  loading,
  onBack,
  onFinalize,
  t,
  ts,
  tc,
}) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-lg font-semibold mb-1">{t('readyToGo')}</h2>
      <p className="text-librarr-text-muted text-sm">
        {t('readyDescription')}
      </p>
    </div>

    {/* Summary */}
    <div className="space-y-3">
      {/* Admin account */}
      <div className="bg-librarr-bg rounded-lg p-4 space-y-2 text-sm">
        <h3 className="font-medium text-librarr-primary-light mb-2">
          {t('stepAccount')}
        </h3>
        <div className="flex justify-between">
          <span className="text-librarr-text-muted">{t('username')}</span>
          <span>{formData.username}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-librarr-text-muted">{t('email')}</span>
          <span>{formData.email}</span>
        </div>
      </div>

      {/* Request types */}
      <div className="bg-librarr-bg rounded-lg p-4 text-sm">
        <h3 className="font-medium text-librarr-primary-light mb-2">
          {t('requestTypesTitle')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {requestTypes.ebook && (
            <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium">
              {ts('contentTypeEbook')}
            </span>
          )}
          {requestTypes.audiobook && (
            <span className="px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-400 text-xs font-medium">
              {ts('contentTypeAudiobook')}
            </span>
          )}
          {requestTypes.music && (
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-400 text-xs font-medium">
              {ts('contentTypeMusic')}
            </span>
          )}
          {!requestTypes.ebook && !requestTypes.audiobook && !requestTypes.music && (
            <span className="text-librarr-text-muted">&mdash;</span>
          )}
        </div>
      </div>

      {/* Services */}
      <div className="bg-librarr-bg rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-medium text-librarr-primary-light mb-2">
          {tc('configure')}
        </h3>

        {/* Hardcover */}
        <div className="flex justify-between">
          <span className="text-librarr-text-muted">{t('hardcoverTitle')}</span>
          <span>
            {hardcoverToken.trim() ? (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                {ts('tokenConfigured')}
              </span>
            ) : (
              <span className="text-librarr-text-muted">&mdash;</span>
            )}
          </span>
        </div>

        {/* Media Servers */}
        <div>
          <span className="text-librarr-text-muted">{t('mediaServerTitle')}</span>
          {mediaServers.length > 0 ? (
            <div className="mt-1 space-y-1">
              {mediaServers.map((server, idx) => (
                <div key={idx} className="flex items-center gap-2 pl-3">
                  <span className="text-xs font-medium text-librarr-primary-light">{server.label}</span>
                  <code className="text-xs">
                    {server.useSsl ? 'https' : 'http'}://{server.hostname}:{server.port}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-librarr-text-muted float-right">&mdash;</span>
          )}
        </div>

        {/* Readarr */}
        {(requestTypes.ebook || requestTypes.audiobook) && (
          <div>
            <span className="text-librarr-text-muted">{t('readarrTitle')}</span>
            {readarrServers.length > 0 ? (
              <div className="mt-1 space-y-1">
                {readarrServers.map((server, idx) => (
                  <div key={idx} className="flex items-center gap-2 pl-3">
                    <span className="text-xs font-medium">{server.name || `Readarr ${idx + 1}`}</span>
                    <code className="text-xs">
                      {server.useSsl ? 'https' : 'http'}://{server.hostname}:{server.port}
                    </code>
                    <span className="px-1.5 py-0.5 text-xs rounded bg-librarr-primary/15 text-librarr-primary-light">
                      {server.contentType}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-librarr-text-muted float-right">&mdash;</span>
            )}
          </div>
        )}

        {/* Lidarr */}
        {requestTypes.music && (
          <div>
            <span className="text-librarr-text-muted">{t('lidarrTitle')}</span>
            {lidarrServers.length > 0 ? (
              <div className="mt-1 space-y-1">
                {lidarrServers.map((server, idx) => (
                  <div key={idx} className="flex items-center gap-2 pl-3">
                    <span className="text-xs font-medium">{server.name || `Lidarr ${idx + 1}`}</span>
                    <code className="text-xs">
                      {server.useSsl ? 'https' : 'http'}://{server.hostname}:{server.port}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-librarr-text-muted float-right">&mdash;</span>
            )}
          </div>
        )}
      </div>
    </div>

    <div className="flex gap-3">
      <button
        type="button"
        onClick={onBack}
        className="btn-secondary flex-1"
      >
        {tc('back')}
      </button>
      <button
        type="button"
        onClick={onFinalize}
        disabled={loading}
        className="btn-primary flex-1 disabled:opacity-50"
      >
        {loading ? t('settingUp') : t('completeSetup')}
      </button>
    </div>
  </div>
);
