import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { JobInfo } from '../../types/api';

export default function JobsSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_JOBS);
  const { settings } = useSettings();
  const { locale } = useLocale();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const { data: jobs, isLoading, mutate } = useSWR<JobInfo[]>(
    hasAccess ? '/api/v1/settings/jobs' : null,
    fetcher,
    {
      // Poll every 5s when any job is running so the UI updates when it finishes
      refreshInterval: (data) =>
        data?.some((j) => j.running) || runningJobs.size > 0 ? 5000 : 0,
    }
  );
  const t = useTranslations('settings');
  const _tc = useTranslations('common');

  const runJob = async (jobId: string) => {
    setRunningJobs((prev) => new Set(prev).add(jobId));
    try {
      await apiPost(`/settings/jobs/${jobId}/run`);
      mutate();
    } finally {
      setRunningJobs((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>{t('jobsTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{t('jobsTitle')}</h1>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid gap-3">
            {(jobs || []).map((job) => {
              const isRunning = job.running || runningJobs.has(job.id);

              return (
                <div
                  key={job.id}
                  className="card p-5 flex items-center gap-4"
                >
                  {/* Status indicator */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isRunning
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-librarr-bg-lighter text-librarr-text-muted'
                  }`}>
                    {isRunning ? (
                      <div className="w-5 h-5 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                    )}
                  </div>

                  {/* Job info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{job.name}</span>
                      {isRunning && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                          Running
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-librarr-text-muted">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                        </svg>
                        <code className="text-xs">{job.schedule}</code>
                      </span>
                      {job.nextRun && (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                          </svg>
                          {new Date(job.nextRun).toLocaleString(locale)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Run button */}
                  <button
                    onClick={() => runJob(job.id)}
                    disabled={isRunning}
                    className="p-2.5 rounded-lg text-librarr-primary hover:bg-librarr-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    title={t('runNow')}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
