import { parsePlatformFeatureSettings } from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';
import { safeFetch } from '@libs/security/destination-guard';
import { ServiceUnavailableException } from '@nestjs/common';

/** Admin changes reach the provider process within 15s without a restart. */
export class PlatformRuntimeSettingsClient {
  private cached:
    | { value: IPlatformFeatureSettings; expiresAt: number }
    | undefined;
  private pending: Promise<IPlatformFeatureSettings> | undefined;

  constructor(
    private readonly config: {
      get(key: 'GENFEEDAI_API_URL' | 'GENFEEDAI_API_KEY'): string | undefined;
    },
  ) {}

  async get(): Promise<IPlatformFeatureSettings> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value;
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async load(): Promise<IPlatformFeatureSettings> {
    try {
      const endpoint = this.config.get('GENFEEDAI_API_URL')?.trim();
      const key = this.config.get('GENFEEDAI_API_KEY')?.trim();
      if (!endpoint || !key) throw new Error('Missing internal configuration');
      const base = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
      // GENFEEDAI_API_URL can include /v1; resolve against the service origin.
      const response = await safeFetch(
        new URL('/v1/internal/platform-runtime-settings', base),
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(3000),
        },
        {
          allowedOrigins: [base.origin],
          allowPrivateNetwork: true,
          maxRedirects: 0,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Settings rejected');
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object')
        throw new Error('Invalid settings');
      const data: unknown = Reflect.get(body, 'data');
      const attributes: unknown =
        data && typeof data === 'object'
          ? Reflect.get(data, 'attributes')
          : null;
      if (
        !attributes ||
        typeof attributes !== 'object' ||
        Array.isArray(attributes)
      )
        throw new Error('Invalid settings');
      const value = parsePlatformFeatureSettings(attributes);
      this.cached = { value, expiresAt: Date.now() + 15000 };
      return value;
    } catch {
      // Never silently switch recipients or email identity during an outage.
      throw new ServiceUnavailableException(
        'Notification settings are unavailable',
      );
    }
  }
}
