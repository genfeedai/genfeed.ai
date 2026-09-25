import type {
  IDesktopEnvironment,
  IDesktopServerProfile,
} from '@genfeedai/contracts/desktop';
import { buildDefaultServerProfile } from './server-profile.util';

const DEFAULT_GENFEED_CLOUD_CDN_URL = 'https://cdn.genfeed.ai';
const DEFAULT_LOCAL_PROVIDER_TIMEOUT_MS = 8_000;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export class DesktopConfigService {
  private readonly defaultServerProfile: IDesktopServerProfile;
  private readonly localProviderTimeoutMs: number;

  constructor() {
    const configuredProviderTimeout = Number(
      process.env.GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS,
    );
    this.localProviderTimeoutMs =
      Number.isFinite(configuredProviderTimeout) &&
      configuredProviderTimeout > 0
        ? configuredProviderTimeout
        : DEFAULT_LOCAL_PROVIDER_TIMEOUT_MS;

    // `GENFEED_DESKTOP_*_URL` still decide the default server; an explicit
    // in-app server selection (DesktopServerService) takes precedence.
    this.defaultServerProfile = buildDefaultServerProfile({
      apiEndpoint: readEnv('GENFEED_DESKTOP_API_URL'),
      authEndpoint: readEnv('GENFEED_DESKTOP_AUTH_URL'),
      mcpEndpoint: readEnv('GENFEED_DESKTOP_MCP_URL'),
      wsEndpoint: readEnv('GENFEED_DESKTOP_WS_URL'),
    });
  }

  getDefaultServerProfile(): IDesktopServerProfile {
    return this.defaultServerProfile;
  }

  getEnvironment(
    serverProfile: IDesktopServerProfile = this.defaultServerProfile,
  ): IDesktopEnvironment {
    const appPort = Number(process.env.GENFEED_DESKTOP_APP_PORT || '3230');

    return {
      apiEndpoint: serverProfile.apiEndpoint,
      appEndpoint:
        process.env.GENFEED_DESKTOP_APP_URL || `http://127.0.0.1:${appPort}`,
      appName: 'desktop',
      appPort,
      authEndpoint: serverProfile.authEndpoint,
      cdnUrl:
        process.env.GENFEED_DESKTOP_CDN_URL || DEFAULT_GENFEED_CLOUD_CDN_URL,
      mcpEndpoint: serverProfile.mcpEndpoint,
      serverId: serverProfile.id,
      serverKind: serverProfile.kind,
      sessionDbPath: process.env.GENFEED_DESKTOP_SESSION_DB_PATH || undefined,
      sentryDsn: process.env.GENFEED_DESKTOP_SENTRY_DSN || undefined,
      sentryEnvironment:
        process.env.GENFEED_DESKTOP_SENTRY_ENVIRONMENT ||
        process.env.NODE_ENV ||
        'development',
      sentryRelease: process.env.GENFEED_DESKTOP_RELEASE || undefined,
      wsEndpoint: serverProfile.wsEndpoint,
    };
  }

  getLocalProviderTimeoutMs(): number {
    return this.localProviderTimeoutMs;
  }
}
