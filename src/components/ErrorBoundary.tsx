import React, { Component } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  children: React.ReactNode;
  title?: string;
  message?: string;
  buttonLabel?: string;
}

interface State {
  hasError: boolean;
}

/** Functional fallback UI that can use hooks */
function ErrorFallback({
  title,
  message,
  buttonLabel,
  onReset,
}: {
  title?: string;
  message?: string;
  buttonLabel?: string;
  onReset: () => void;
}) {
  let t: ReturnType<typeof useTranslations> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    t = useTranslations('errors');
  } catch {
    // IntlProvider may not be available if ErrorBoundary wraps it
  }

  const resolvedTitle = title || t?.('somethingWrong') || 'Something went wrong';
  const resolvedMessage =
    message ||
    t?.('unexpectedError') ||
    'An unexpected error occurred. Please try refreshing the page.';
  const resolvedButton = buttonLabel || t?.('refreshPage') || 'Refresh Page';

  return (
    <div className="min-h-screen bg-librarr-bg flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-librarr-text mb-4">
          {resolvedTitle}
        </h1>
        <p className="text-librarr-text-muted mb-6">{resolvedMessage}</p>
        <button
          onClick={() => {
            onReset();
            window.location.reload();
          }}
          className="btn-primary"
        >
          {resolvedButton}
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          title={this.props.title}
          message={this.props.message}
          buttonLabel={this.props.buttonLabel}
          onReset={() => this.setState({ hasError: false })}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
