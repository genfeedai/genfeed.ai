import { ButtonVariant } from '@genfeedai/enums';
import AuthActionSurface from '@ui/layouts/auth/AuthActionSurface';
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

        <AuthActionSurface
          actions={
            <>
              <Button
                className="auth-btn"
                disabled={isLoading || isOfflineLoading}
                onClick={() => void handleBrowserLogin()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {isLoading
                  ? 'Opening browser...'
                  : 'Sign in with Genfeed Cloud'}
              </Button>
              <Button
                className="auth-btn"
                disabled={isLoading || isOfflineLoading}
                onClick={() => void handleContinueOffline()}
                type="button"
                variant={ButtonVariant.SECONDARY}
              >
                {isOfflineLoading
                  ? 'Opening local workspace...'
                  : 'Continue without an account'}
              </Button>
            </>
          }
          className="desktop-auth-surface"
          description="Sign in to Genfeed"
          error={error}
          footer={
            <p className="auth-footer">
              Sign in opens app.genfeed.ai in your browser. Your token is stored
              securely in the OS keychain.
            </p>
          }
          supportingCopy={
            <p className="auth-supporting-copy">
              Your work stays on this device. Connect Genfeed Cloud anytime.
            </p>
          }
          title="Welcome back"
        />
      </div>
    </div>
  );
};
