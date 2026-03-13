import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { User } from '../../context/UserContext';
import { apiPost } from '../../hooks/useApi';

interface UserDropdownProps {
  user: User;
}

export default function UserDropdown({ user }: UserDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations('auth');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>(
          'a[role="menuitem"], button[role="menuitem"]'
        );
        if (!items || items.length === 0) return;

        const current = document.activeElement;
        const idx = Array.from(items).indexOf(current as HTMLElement);
        let next: number;

        if (e.key === 'ArrowDown') {
          next = idx < items.length - 1 ? idx + 1 : 0;
        } else {
          next = idx > 0 ? idx - 1 : items.length - 1;
        }
        items[next].focus();
      }
    },
    [open]
  );

  // Focus first menu item when opening
  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector<HTMLElement>(
        'a[role="menuitem"], button[role="menuitem"]'
      );
      first?.focus();
    }
  }, [open]);

  const handleLogout = async () => {
    await apiPost('/auth/logout');
    router.push('/login');
  };

  return (
    <div className="relative" ref={ref} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-librarr-bg-lighter transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-librarr-primary flex items-center justify-center text-sm font-bold text-white">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <span className="hidden sm:block text-sm font-medium">{user.username}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 mt-2 w-48 bg-librarr-bg-light border border-librarr-bg-lighter rounded-lg shadow-xl py-1 z-50"
        >
          <Link
            href={`/users/${user.id}`}
            role="menuitem"
            tabIndex={0}
            className="block px-4 py-2 text-sm text-librarr-text-muted hover:bg-librarr-bg-lighter hover:text-librarr-text"
            onClick={() => setOpen(false)}
          >
            {t('profile')}
          </Link>
          <Link
            href={`/users/${user.id}/settings`}
            role="menuitem"
            tabIndex={0}
            className="block px-4 py-2 text-sm text-librarr-text-muted hover:bg-librarr-bg-lighter hover:text-librarr-text"
            onClick={() => setOpen(false)}
          >
            {t('settings')}
          </Link>
          <hr className="border-librarr-bg-lighter my-1" />
          <button
            role="menuitem"
            tabIndex={0}
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-librarr-danger hover:bg-librarr-bg-lighter"
          >
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
