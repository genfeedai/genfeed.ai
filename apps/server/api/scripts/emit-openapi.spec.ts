import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./emit-openapi.ts', import.meta.url)),
  'utf8',
);

describe('emit-openapi env pins', () => {
  it('pins the shared Google OAuth client from #4173', () => {
    expect(source).toContain(
      "GOOGLE_OAUTH_CLIENT_ID: 'openapi-emit-placeholder'",
    );
    expect(source).toContain(
      "GOOGLE_OAUTH_CLIENT_SECRET: 'openapi-emit-placeholder'",
    );
    expect(source).toContain('YOUTUBE_REDIRECT_URI:');
  });

  it('does not reintroduce retired per-connector Google client aliases', () => {
    expect(source).not.toContain('YOUTUBE_CLIENT_ID');
    expect(source).not.toContain('YOUTUBE_CLIENT_SECRET');
    expect(source).not.toContain('GOOGLE_ADS_CLIENT_ID');
    expect(source).not.toContain('GOOGLE_ADS_CLIENT_SECRET');
    expect(source).not.toContain('GOOGLE_SEARCH_CONSOLE_CLIENT_ID');
    expect(source).not.toContain('GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET');
    expect(source).not.toMatch(/(?<![A-Z_])GOOGLE_CLIENT_ID/);
    expect(source).not.toMatch(/(?<![A-Z_])GOOGLE_CLIENT_SECRET/);
  });
});
