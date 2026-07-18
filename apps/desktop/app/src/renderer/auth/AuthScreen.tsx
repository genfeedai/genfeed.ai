import { ButtonVariant } from '@genfeedai/enums';
import AuthActionSurface from '@ui/layouts/auth/AuthActionSurface';
import { Button } from '@ui/primitives/button';
import { useRef, useState } from 'react';

export const AuthScreen = () => {
  const [pendingAction, setPendingAction] = useState<
    'accountless' | 'login' | null
  >(null);
  const pendingActionRef = useRef<'accountless' | 'login' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBrowserLogin = async (): Promise<void> => {
    if (pendingActionRef.current) return;

    pendingActionRef.current = 'login';
    setPendingAction('login');
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
      if (pendingActionRef.current === 'login') {
        pendingActionRef.current = null;
        setPendingAction(null);
      }
    }
  };

  const handleContinueOffline = async (): Promise<void> => {
    if (pendingActionRef.current) return;

    pendingActionRef.current = 'accountless';
    setPendingAction('accountless');
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
      if (pendingActionRef.current === 'accountless') {
        pendingActionRef.current = null;
        setPendingAction(null);
      }
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
                disabled={pendingAction !== null}
                onClick={() => void handleBrowserLogin()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {pendingAction === 'login'
                  ? 'Opening browser...'
                  : 'Sign in with Genfeed Cloud'}
              </Button>
              <Button
                className="auth-btn"
                disabled={pendingAction !== null}
                onClick={() => void handleContinueOffline()}
                type="button"
                variant={ButtonVariant.SECONDARY}
              >
                {pendingAction === 'accountless'
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
