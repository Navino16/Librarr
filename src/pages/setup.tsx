import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useTranslations } from 'next-intl';
import { useUser } from '../context/UserContext';
import { useSettings } from '../context/SettingsContext';
import { apiPost } from '../hooks/useApi';
import {
  ALL_STEPS,
  jellyfinDefaults, plexDefaults, absDefaults, readarrDefaults, lidarrDefaults,
} from '../components/Setup/constants';
import { STEP_ICONS, CheckmarkIcon } from '../components/Setup/setupIcons';
import { Step1Account } from '../components/Setup/Step1Account';
import { Step2RequestTypes } from '../components/Setup/Step2RequestTypes';
import { Step3Hardcover } from '../components/Setup/Step3Hardcover';
import { Step4MediaServers } from '../components/Setup/Step4MediaServers';
import { Step5Readarr } from '../components/Setup/Step5Readarr';
import { Step6Lidarr } from '../components/Setup/Step6Lidarr';
import { Step7Confirm } from '../components/Setup/Step7Confirm';
import type { ServerType, SavedMediaServer, SavedReadarr, SavedLidarr } from '../components/Setup/constants';

export default function SetupPage() {
  const router = useRouter();
  const { mutate: mutateUser } = useUser();
  const { settings, mutate: mutateSettings } = useSettings();

  // Core wizard state
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaTestResult, setMediaTestResult] = useState<boolean | null>(null);
  const [mediaTestLoading, setMediaTestLoading] = useState(false);
  const [readarrTestResult, setReadarrTestResult] = useState<boolean | null>(null);
  const [readarrTestLoading, setReadarrTestLoading] = useState(false);
  const [lidarrTestResult, setLidarrTestResult] = useState<boolean | null>(null);
  const [lidarrTestLoading, setLidarrTestLoading] = useState(false);

  // Step 1 - Admin account
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Step 2 - Request types
  const [requestTypes, setRequestTypes] = useState({
    ebook: true,
    audiobook: true,
    music: true,
  });

  // Step 3 - Hardcover
  const [hardcoverToken, setHardcoverToken] = useState('');

  // Step 4 - Media server (multi-server)
  const [mediaServerType, setMediaServerType] = useState<ServerType>('jellyfin');
  const [jellyfinForm, setJellyfinForm] = useState({ ...jellyfinDefaults });
  const [plexForm, setPlexForm] = useState({ ...plexDefaults });
  const [absForm, setAbsForm] = useState({ ...absDefaults });
  const [mediaServers, setMediaServers] = useState<SavedMediaServer[]>([]);
  const [showMediaServerForm, setShowMediaServerForm] = useState(true);

  // Step 5 - Readarr (multi-server)
  const [readarrForm, setReadarrForm] = useState<SavedReadarr>({ ...readarrDefaults });
  const [readarrServers, setReadarrServers] = useState<SavedReadarr[]>([]);
  const [showReadarrForm, setShowReadarrForm] = useState(true);

  // Step 6 - Lidarr (multi-server)
  const [lidarrForm, setLidarrForm] = useState<SavedLidarr>({ ...lidarrDefaults });
  const [lidarrServers, setLidarrServers] = useState<SavedLidarr[]>([]);
  const [showLidarrForm, setShowLidarrForm] = useState(true);

  const t = useTranslations('setup');
  const ts = useTranslations('settings');
  const tc = useTranslations('common');

  // Focus management: move focus to step content on step change
  const stepContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepContentRef.current?.focus();
  }, [step]);

  // Compute visible steps based on request types
  const visibleSteps = useMemo(() => {
    return ALL_STEPS.filter((s) => {
      if (s.id === 5) return requestTypes.ebook || requestTypes.audiobook;
      if (s.id === 6) return requestTypes.music;
      return true;
    });
  }, [requestTypes]);

  const currentVisibleIndex = visibleSteps.findIndex((s) => s.id === step);

  // Redirect if already initialized
  if (settings?.initialized) {
    router.replace('/');
    return null;
  }

  const goToNextStep = () => {
    const nextIndex = currentVisibleIndex + 1;
    if (nextIndex < visibleSteps.length) {
      setStep(visibleSteps[nextIndex].id);
      setError('');
      setMediaTestResult(null);
      setReadarrTestResult(null);
      setLidarrTestResult(null);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentVisibleIndex - 1;
    if (prevIndex >= 0) {
      setStep(visibleSteps[prevIndex].id);
      setError('');
    }
  };

  // Step 7 - Submit everything
  const handleFinalize = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await apiPost('/settings/initialize', {
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });

      const mainPayload: Record<string, unknown> = {
        enableEbookRequests: requestTypes.ebook,
        enableAudiobookRequests: requestTypes.audiobook,
        enableMusicRequests: requestTypes.music,
      };
      if (hardcoverToken.trim()) {
        mainPayload.hardcoverToken = hardcoverToken.trim();
      }
      await apiPost('/settings/main', mainPayload);

      for (const server of mediaServers) {
        await apiPost(`/settings/${server.type}`, server.form);
      }
      for (const server of readarrServers) {
        await apiPost('/settings/readarr', server);
      }
      for (const server of lidarrServers) {
        await apiPost('/settings/lidarr', server);
      }

      mutateUser();
      mutateSettings();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const useWideContainer = step >= 2;

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Step1Account
            formData={formData}
            setFormData={setFormData}
            onNext={goToNextStep}
            error={error}
            setError={setError}
            t={t}
            tc={tc}
          />
        );
      case 2:
        return (
          <Step2RequestTypes
            requestTypes={requestTypes}
            setRequestTypes={setRequestTypes}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            t={t}
            ts={ts}
            tc={tc}
          />
        );
      case 3:
        return (
          <Step3Hardcover
            hardcoverToken={hardcoverToken}
            setHardcoverToken={setHardcoverToken}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            t={t}
            tc={tc}
          />
        );
      case 4:
        return (
          <Step4MediaServers
            mediaServerType={mediaServerType}
            setMediaServerType={setMediaServerType}
            jellyfinForm={jellyfinForm}
            setJellyfinForm={setJellyfinForm}
            plexForm={plexForm}
            setPlexForm={setPlexForm}
            absForm={absForm}
            setAbsForm={setAbsForm}
            mediaServers={mediaServers}
            setMediaServers={setMediaServers}
            showMediaServerForm={showMediaServerForm}
            setShowMediaServerForm={setShowMediaServerForm}
            testResult={mediaTestResult}
            setTestResult={setMediaTestResult}
            testLoading={mediaTestLoading}
            setTestLoading={setMediaTestLoading}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            t={t}
            ts={ts}
            tc={tc}
          />
        );
      case 5:
        return (
          <Step5Readarr
            form={readarrForm}
            setForm={setReadarrForm}
            servers={readarrServers}
            setServers={setReadarrServers}
            showForm={showReadarrForm}
            setShowForm={setShowReadarrForm}
            testResult={readarrTestResult}
            setTestResult={setReadarrTestResult}
            testLoading={readarrTestLoading}
            setTestLoading={setReadarrTestLoading}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            t={t}
            ts={ts}
            tc={tc}
          />
        );
      case 6:
        return (
          <Step6Lidarr
            form={lidarrForm}
            setForm={setLidarrForm}
            servers={lidarrServers}
            setServers={setLidarrServers}
            showForm={showLidarrForm}
            setShowForm={setShowLidarrForm}
            testResult={lidarrTestResult}
            setTestResult={setLidarrTestResult}
            testLoading={lidarrTestLoading}
            setTestLoading={setLidarrTestLoading}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            t={t}
            ts={ts}
            tc={tc}
          />
        );
      case 7:
        return (
          <Step7Confirm
            formData={formData}
            requestTypes={requestTypes}
            hardcoverToken={hardcoverToken}
            mediaServers={mediaServers}
            readarrServers={readarrServers}
            lidarrServers={lidarrServers}
            loading={loading}
            onBack={() => {
              const prev = visibleSteps[visibleSteps.length - 2];
              if (prev) setStep(prev.id);
            }}
            onFinalize={handleFinalize}
            t={t}
            ts={ts}
            tc={tc}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>{t('title')} - Librarr</title>
      </Head>
      <div className="min-h-screen bg-librarr-bg flex items-center justify-center px-4 py-8">
        <div className={`w-full ${useWideContainer ? 'max-w-2xl' : 'max-w-lg'}`}>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-librarr-primary mb-2">Librarr</h1>
            <p className="text-librarr-text-muted">{t('welcome')}</p>
          </div>

          {/* Progress indicator with icons */}
          <nav
            aria-label={`Step ${currentVisibleIndex + 1} of ${visibleSteps.length}`}
            className="flex items-center justify-center gap-2 md:gap-3 mb-8"
          >
            {visibleSteps.map((s, idx) => {
              const isCompleted = visibleSteps.findIndex((vs) => vs.id === step) > idx;
              const isActive = s.id === step;
              const isFuture = !isCompleted && !isActive;

              return (
                <div key={s.id} className="flex items-center gap-2 md:gap-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      aria-current={isActive ? 'step' : undefined}
                      aria-label={t(s.labelKey)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-librarr-primary/20 text-librarr-primary-light'
                          : isActive
                            ? 'bg-librarr-primary text-white ring-2 ring-librarr-primary-light ring-offset-2 ring-offset-librarr-bg'
                            : 'bg-librarr-bg-lighter/50 text-librarr-text-muted/60'
                      }`}
                    >
                      {isCompleted ? <CheckmarkIcon /> : STEP_ICONS[s.id]}
                    </div>
                    <span
                      className={`text-xs transition-colors ${
                        isActive
                          ? 'text-librarr-primary-light font-medium'
                          : isFuture
                            ? 'text-librarr-text-muted/60'
                            : 'text-librarr-text-muted'
                      }`}
                    >
                      <span className="md:hidden">{idx + 1}</span>
                      <span className="hidden md:inline">{t(s.labelKey)}</span>
                    </span>
                  </div>
                  {idx < visibleSteps.length - 1 && (
                    <div
                      className={`w-4 md:w-6 h-0.5 mb-5 md:mb-0 transition-colors ${
                        isCompleted
                          ? 'bg-librarr-primary/40'
                          : 'bg-librarr-bg-lighter'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </nav>

          <div className="card p-6" ref={stepContentRef} tabIndex={-1} style={{ outline: 'none' }}>
            <div key={step} className="animate-fade-in">
            {error && (
              <div className="mb-4 p-3 bg-librarr-danger/10 border border-librarr-danger/20 rounded-lg text-librarr-danger text-sm">
                {error}
              </div>
            )}
            {renderStep()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
