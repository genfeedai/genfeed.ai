import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const OAUTH_CONTROLLER_FILES = [
  'apps/server/api/src/services/integrations/instagram/controllers/instagram.controller.ts',
  'apps/server/api/src/services/integrations/tiktok/controllers/tiktok.controller.ts',
] as const;

const PERSONAL_TUNNEL_URL =
  /https:\/\/[a-z0-9-]+\.(?:ngrok-free\.app|ngrok\.io|trycloudflare\.com|loca\.lt)\b/i;

const RETIRED_EXPORTS = [
  {
    file: 'packages/auth-client/src/server.ts',
    symbol: 'createRouteMatcher',
  },
  {
    file: 'packages/auth-client/src/server.ts',
    symbol: 'authMiddleware',
  },
  {
    file: 'packages/storage/src/path-containment.ts',
    symbol: 'assertObjectKeyWithinPrefix',
  },
  {
    file: 'packages/storage/src/index.ts',
    symbol: 'assertObjectKeyWithinPrefix',
  },
  {
    file: 'packages/libs/security/index.ts',
    symbol: 'assertObjectKeyWithinPrefix',
  },
] as const;

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('public repository hygiene', () => {
  it.each(OAUTH_CONTROLLER_FILES)(
    'keeps the personal tunnel URL out of %s',
    (file) => {
      expect(readSource(file)).not.toMatch(PERSONAL_TUNNEL_URL);
    },
  );

  it.each(RETIRED_EXPORTS)(
    'keeps $symbol retired in $file',
    ({ file, symbol }) => {
      expect(readSource(file)).not.toMatch(new RegExp(`\\b${symbol}\\b`));
    },
  );
});
