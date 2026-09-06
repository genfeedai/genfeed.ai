import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { serializeLatestRelease } from '@serializers/server/system/release.serializer';

@Injectable()
export class ReleasesService {
  private cached: {
    expiresAt: number;
    release: ReturnType<typeof serializeLatestRelease>;
  } | null = null;

  async latest() {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.release;
    try {
      const response = await fetch(
        'https://api.github.com/repos/genfeedai/genfeed.ai/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Genfeed-update-check',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const release = serializeLatestRelease(await response.json());
      this.cached = { expiresAt: Date.now() + 300_000, release };
      return release;
    } catch {
      throw new ServiceUnavailableException('Could not check for updates');
    }
  }
}
