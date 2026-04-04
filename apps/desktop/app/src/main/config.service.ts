import type { IDesktopEnvironment } from '@genfeedai/desktop-contracts';

export class DesktopConfigService {
  private readonly environment: IDesktopEnvironment;

  constructor() {
    this.environment = {
      apiEndpoint:
        process.env.GENFEED_DESKTOP_API_URL || 'https://api.genfeed.ai/v1',
      appEndpoint:
        process.env.GENFEED_DESKTOP_APP_URL || 'https://app.genfeed.ai',
      appName: 'desktop',
      authEndpoint:
        process.env.GENFEED_DESKTOP_AUTH_URL ||
        'https://app.genfeed.ai/oauth/cli',
      cdnUrl: process.env.GENFEED_DESKTOP_CDN_URL || 'https://cdn.genfeed.ai',
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
