import type { IDesktopEnvironment } from '@genfeedai/contracts/desktop';

const DEFAULT_GENFEED_CLOUD_API_URL = 'https://api.genfeed.ai/v1';
const DEFAULT_GENFEED_CLOUD_AUTH_URL = 'https://app.genfeed.ai/oauth/cli';
const DEFAULT_GENFEED_CLOUD_CDN_URL = 'https://cdn.genfeed.ai';
const DEFAULT_GENFEED_CLOUD_WS_URL = 'https://notifications.genfeed.ai';
const DEFAULT_LOCAL_PROVIDER_TIMEOUT_MS = 8_000;

export class DesktopConfigService {
  private readonly environment: IDesktopEnvironment;
  private readonly localProviderTimeoutMs: number;

  constructor() {
    const appPort = Number(process.env.GENFEED_DESKTOP_APP_PORT || '3230');
    const configuredProviderTimeout = Number(
      process.env.GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS,
    );
    this.localProviderTimeoutMs =
      Number.isFinite(configuredProviderTimeout) &&
      configuredProviderTimeout > 0
        ? configuredProviderTimeout
        : DEFAULT_LOCAL_PROVIDER_TIMEOUT_MS;

    this.environment = {
      apiEndpoint:
        process.env.GENFEED_DESKTOP_API_URL || DEFAULT_GENFEED_CLOUD_API_URL,
      appEndpoint:
        process.env.GENFEED_DESKTOP_APP_URL || `http://127.0.0.1:${appPort}`,
      appName: 'desktop',
      appPort,
      authEndpoint:
        process.env.GENFEED_DESKTOP_AUTH_URL || DEFAULT_GENFEED_CLOUD_AUTH_URL,
      cdnUrl:
        process.env.GENFEED_DESKTOP_CDN_URL || DEFAULT_GENFEED_CLOUD_CDN_URL,
      sessionDbPath: process.env.GENFEED_DESKTOP_SESSION_DB_PATH || undefined,
      sentryDsn: process.env.GENFEED_DESKTOP_SENTRY_DSN || undefined,
      sentryEnvironment:
        process.env.GENFEED_DESKTOP_SENTRY_ENVIRONMENT ||
        process.env.NODE_ENV ||
        'development',
      sentryRelease: process.env.GENFEED_DESKTOP_RELEASE || undefined,
      wsEndpoint:
        process.env.GENFEED_DESKTOP_WS_URL || DEFAULT_GENFEED_CLOUD_WS_URL,
    };
  }

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }

  getLocalProviderTimeoutMs(): number {
    return this.localProviderTimeoutMs;
  }
}
