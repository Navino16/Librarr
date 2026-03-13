import React, { createContext, useContext, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '../hooks/useApi';

export interface PublicSettings {
  appTitle: string;
  initialized: boolean;
  localLogin: boolean;
  plexLogin: boolean;
  oidcLogin: boolean;
  oidcProviders: { id: string; name: string }[];
  bookEnabled: boolean;
  hideAvailable: boolean;
  enableEbookRequests: boolean;
  enableAudiobookRequests: boolean;
  enableMusicRequests: boolean;
  smtpConfigured: boolean;
}

interface SettingsContextType {
  settings?: PublicSettings;
  isLoading: boolean;
  mutate: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  isLoading: true,
  mutate: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, mutate } = useSWR<PublicSettings>(
    '/api/v1/settings/public',
    fetcher,
    { revalidateOnFocus: false }
  );

  const value = useMemo(
    () => ({ settings: data, isLoading, mutate }),
    [data, isLoading, mutate]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export default SettingsContext;
