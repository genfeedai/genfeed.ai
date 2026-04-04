import * as Sentry from '@sentry/node';
import * as vscode from 'vscode';

const SENTRY_DSN = process.env.SENTRY_DSN;

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

let isInitialized = false;

export function initializeErrorTracking(entrypoint: string): void {
  if (isInitialized || isTest || !isProduction || !SENTRY_DSN) {
    return;
  }

  const extensionVersion =
    vscode.extensions.getExtension('genfeedai.extension-ide')?.packageJSON
      ?.version ?? '0.0.0';

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: `ide-extension@${extensionVersion}`,
    tracesSampleRate: 0.1,
  });

  Sentry.setTag('app', 'ide-extension');
  Sentry.setTag('entrypoint', entrypoint);
  Sentry.setTag('ide', vscode.env.appName);

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
    scope.setTag('source', 'ide-extension');

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureException(new Error(message));
  });
}

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  if (!isInitialized) {
    return;
  }

  await Sentry.close(timeoutMs);
}
