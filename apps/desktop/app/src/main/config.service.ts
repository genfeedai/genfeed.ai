import type { IDesktopEnvironment } from '@genfeedai/desktop-contracts';

export class DesktopConfigService {
  private readonly environment: IDesktopEnvironment;

  constructor() {
    const appPort = Number(process.env.GENFEED_DESKTOP_APP_PORT || '3230');

    this.environment = {
      apiEndpoint:
        process.env.GENFEED_DESKTOP_API_URL || 'http://localhost:3010/v1',
      appEndpoint:
        process.env.GENFEED_DESKTOP_APP_URL || `http://127.0.0.1:${appPort}`,
      appName: 'desktop',
      appPort,
      authEndpoint:
        process.env.GENFEED_DESKTOP_AUTH_URL ||
        'https://app.genfeed.ai/oauth/cli',
      cdnUrl: process.env.GENFEED_DESKTOP_CDN_URL || 'https://cdn.genfeed.ai',
      sessionDbPath: process.env.GENFEED_DESKTOP_SESSION_DB_PATH || undefined,
      sentryDsn: process.env.GENFEED_DESKTOP_SENTRY_DSN || undefined,
      sentryEnvironment:
        process.env.GENFEED_DESKTOP_SENTRY_ENVIRONMENT ||
        process.env.NODE_ENV ||
        'development',
      sentryRelease: process.env.GENFEED_DESKTOP_RELEASE || undefined,
      wsEndpoint:
        process.env.GENFEED_DESKTOP_WS_URL ||
        'https://notifications.genfeed.ai',
    };
  }

  getEnvironment(): IDesktopEnvironment {
    return this.environment;
  }
}
