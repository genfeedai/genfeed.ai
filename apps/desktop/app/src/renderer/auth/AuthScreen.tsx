import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';

export const AuthScreen = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOfflineLoading, setIsOfflineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowserLogin = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await window.genfeedDesktop.auth.login();
      await window.genfeedDesktop.notifications.notify(
        'Finish sign in',
        'Complete the browser sign-in flow to attach your desktop session.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to open browser. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueOffline = async (): Promise<void> => {
    setIsOfflineLoading(true);
    setError(null);

    try {
      await window.genfeedDesktop.app.enableOfflineMode();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to continue offline. Please try again.',
      );
    } finally {
      setIsOfflineLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-mark large">G</span>
        </div>

        <h1>Welcome to GenFeed</h1>
        <p className="auth-subtitle">
          The Cursor of content creation. Sign in to connect your account.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-actions">
          <Button
            className="auth-btn"
            disabled={isLoading || isOfflineLoading}
            onClick={() => void handleBrowserLogin()}
            type="button"
            variant={ButtonVariant.DEFAULT}
          >
            {isLoading ? 'Opening browser...' : 'Sign in with Browser'}
          </Button>
          <Button
            className="auth-btn"
            disabled={isLoading || isOfflineLoading}
            onClick={() => void handleContinueOffline()}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            {isOfflineLoading ? 'Opening offline mode...' : 'Continue Offline'}
          </Button>
        </div>

        <p className="auth-footer">
          Sign in opens app.genfeed.ai in your browser.
          <br />
          Your token is stored securely in the OS keychain.
        </p>
      </div>
    </div>
  );
};
