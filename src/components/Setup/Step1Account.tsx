import React from 'react';

interface Step1AccountProps {
  formData: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  setFormData: (data: Step1AccountProps['formData']) => void;
  onNext: () => void;
  error: string;
  setError: (e: string) => void;
  t: (key: string) => string;
  tc: (key: string) => string;
}

export const Step1Account: React.FC<Step1AccountProps> = ({
  formData,
  setFormData,
  onNext,
  error: _error,
  setError,
  t,
  tc,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    if (formData.password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">{t('createAdmin')}</h2>
      <div>
        <label htmlFor="setup-username" className="block text-sm font-medium text-librarr-text-muted mb-1">
          {t('username')}
        </label>
        <input
          id="setup-username"
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          className="input-field"
          placeholder="admin"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label htmlFor="setup-email" className="block text-sm font-medium text-librarr-text-muted mb-1">
          {t('email')}
        </label>
        <input
          id="setup-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="input-field"
          placeholder="admin@example.com"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label htmlFor="setup-password" className="block text-sm font-medium text-librarr-text-muted mb-1">
          {t('password')}
        </label>
        <input
          id="setup-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="input-field"
          placeholder={t('minChars')}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div>
        <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-librarr-text-muted mb-1">
          {t('confirmPassword')}
        </label>
        <input
          id="setup-confirm-password"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) =>
            setFormData({ ...formData, confirmPassword: e.target.value })
          }
          className="input-field"
          placeholder={t('repeatPassword')}
          autoComplete="new-password"
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full">
        {tc('next')}
      </button>
    </form>
  );
};
