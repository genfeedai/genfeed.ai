import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import * as Sentry from '@sentry/browser';

let initialized = false;

export function initializeRendererTelemetry(
  environment: IDesktopEnvironment,
  session: IDesktopSession | null,
): void {
  if (initialized || !environment.sentryDsn) {
    return;
  }

  Sentry.init({
    attachStacktrace: true,
    dsn: environment.sentryDsn,
    environment: environment.sentryEnvironment,
    release: environment.sentryRelease,
    tracesSampleRate: 0.1,
  });

  Sentry.setTag('app', 'desktop');
  Sentry.setTag('runtime', 'renderer');

  if (session) {
    Sentry.setUser({
      email: session.userEmail,
      id: session.userId,
      username: session.userName,
    });
  }

  initialized = true;
}
