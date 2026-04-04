import * as Sentry from '@sentry/browser';
import {
  isProduction,
  isTest,
  websiteDomain,
} from '~services/environment.service';

const SENTRY_DSN = process.env.PLASMO_PUBLIC_SENTRY_DSN;

let isInitialized = false;

export function initializeErrorTracking(entrypoint: string): void {
  if (isInitialized || isTest || !isProduction || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.PLASMO_PUBLIC_ENV || process.env.NODE_ENV,
    release: process.env.PLASMO_PUBLIC_APP_VERSION,
    tracesSampleRate: 0.1,
  });

  Sentry.setTag('app', 'extension');
  Sentry.setTag('entrypoint', entrypoint);
  Sentry.setTag('website_domain', websiteDomain);

  isInitialized = true;
}

export function captureExtensionError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void {
  if (isTest || !isProduction) {
    return;
  }

  initializeErrorTracking('runtime');

  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setContext('extension', context || {});
    scope.setTag('source', 'logger');

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureException(new Error(message));
  });
}
