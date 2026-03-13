import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUser } from '../context/UserContext';
import { hasPermission } from '../constants/permissions';

export function useHasPermission(permission: number): boolean {
  const { user } = useUser();
  if (!user) return false;
  return hasPermission(user.permissions, permission);
}

/**
 * Same as useHasPermission but redirects to home if access is denied.
 */
export function useRequirePermission(permission: number): boolean {
  const { user } = useUser();
  const router = useRouter();
  const allowed = !!user && hasPermission(user.permissions, permission);

  useEffect(() => {
    if (user && !allowed) {
      router.replace('/');
    }
  }, [user, allowed, router]);

  return allowed;
}
