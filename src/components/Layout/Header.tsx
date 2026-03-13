import React from 'react';
import { useTranslations } from 'next-intl';
import { useUser } from '../../context/UserContext';
import SearchInput from './SearchInput';
import UserDropdown from './UserDropdown';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useUser();
  const tc = useTranslations('common');

  return (
    <header className="sticky top-0 z-30 flex items-center h-16 px-4 lg:px-6 bg-librarr-bg border-b border-librarr-bg-lighter">
      <button
        onClick={onMenuClick}
        aria-label={tc('openMenu')}
        className="lg:hidden p-2 mr-2 text-librarr-text-muted hover:text-librarr-text rounded-lg"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex-1 max-w-xl">
        <SearchInput />
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user && <UserDropdown user={user} />}
      </div>
    </header>
  );
}
