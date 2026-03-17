import React, { useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { useUser } from '../../context/UserContext';
import { useHasPermission } from '../../hooks/usePermission';
import { Permission, canAccessSettings } from '../../constants/permissions';
import Logo from '../Common/Logo';

const IconDiscover = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
);
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const IconRequests = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
);
const IconIssues = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const IconUsers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>
);

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.FC;
  permission?: number;
  permissionCheck?: (perms: number) => boolean;
}

const navItems: NavItem[] = [
  { href: '/', labelKey: 'discover', icon: IconDiscover },
  { href: '/search', labelKey: 'search', icon: IconSearch },
  { href: '/requests', labelKey: 'requests', icon: IconRequests },
  { href: '/issues', labelKey: 'issues', icon: IconIssues, permission: Permission.VIEW_ISSUES },
  { href: '/users', labelKey: 'users', icon: IconUsers, permission: Permission.MANAGE_USERS },
  { href: '/settings', labelKey: 'settings', icon: IconSettings, permissionCheck: canAccessSettings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const router = useRouter();
  const t = useTranslations('nav');
  const asideRef = useRef<HTMLElement>(null);

  // Trap focus within sidebar on mobile when open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open || !asideRef.current) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = asideRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus sidebar when it opens on mobile
  useEffect(() => {
    if (open && asideRef.current) {
      const first = asideRef.current.querySelector<HTMLElement>('a[href]');
      first?.focus();
    }
  }, [open]);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={asideRef}
        role="navigation"
        aria-label={t('discover')}
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-librarr-bg-light border-r border-librarr-bg-lighter transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center h-16 px-6 border-b border-librarr-bg-lighter">
          <Link href="/">
            <Logo size="md" />
          </Link>
        </div>
        <nav className="mt-4 px-3">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? router.pathname === '/'
                : router.pathname.startsWith(item.href);

            return (
              <SidebarItem
                key={item.href}
                item={item}
                label={t(item.labelKey)}
                isActive={isActive}
                onClick={onClose}
              />
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function SidebarItem({
  item,
  label,
  isActive,
  onClick,
}: {
  item: NavItem;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { user } = useUser();
  const hasAccess = useHasPermission(item.permission ?? Permission.NONE);

  let shouldShow: boolean;
  if (item.permissionCheck) {
    shouldShow = user ? item.permissionCheck(user.permissions) : false;
  } else {
    shouldShow = !item.permission || hasAccess;
  }

  if (!shouldShow) return null;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors duration-150 ${
        isActive
          ? 'bg-librarr-primary text-white'
          : 'text-librarr-text-muted hover:bg-librarr-bg-lighter hover:text-librarr-text'
      }`}
    >
      <span aria-hidden="true"><item.icon /></span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
