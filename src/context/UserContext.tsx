import React, { createContext, useContext, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '../hooks/useApi';

export interface UserSettings {
  id: number;
  locale: string;
}

export interface User {
  id: number;
  email?: string;
  username: string;
  userType: number;
  permissions: number;
  avatar?: string;
  settings?: UserSettings;
  createdAt: string;
  updatedAt: string;
}

interface UserContextType {
  user?: User;
  isLoading: boolean;
  error?: Error;
  mutate: () => void;
}

const UserContext = createContext<UserContextType>({
  isLoading: true,
  mutate: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<User>(
    '/api/v1/auth/me',
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const value = useMemo(
    () => ({ user: data, isLoading, error: error as Error, mutate }),
    [data, isLoading, error, mutate]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export default UserContext;
