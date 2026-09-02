import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Platform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_SRC = path.resolve(SPEC_DIR, '../..');

const OAUTH_PROFILE_IMPORT_PROVIDERS = [
  Platform.FACEBOOK,
  Platform.LINKEDIN,
  Platform.REDDIT,
  Platform.THREADS,
  Platform.TIKTOK,
  Platform.TWITTER,
  Platform.YOUTUBE,
] as const;

describe('OAuth callback profile import contract', () => {
  it('imports avatars through the shared SSRF-guarded credential path', () => {
    const source = readFileSync(
      path.join(
        API_SRC,
        'collections/credentials/services/credentials.service.ts',
      ),
      'utf8',
    );

    expect(source).toContain('assertUrlNotPrivate(profile.avatarUrl)');
    expect(source).toContain('type: FileInputType.URL');
    expect(source).toContain('url: profile.avatarUrl');
  });

  it.each(OAUTH_PROFILE_IMPORT_PROVIDERS)(
    'routes %s callback profile and avatar through updateExternalProfile',
    (platform) => {
      const source = readFileSync(
        path.join(
          API_SRC,
          'services/integrations',
          platform,
          'controllers',
          `${platform}.controller.ts`,
        ),
        'utf8',
      );

      expect(source).toContain('updateExternalProfile');
      expect(source).toMatch(/\bavatarUrl\b/);
    },
  );
});
