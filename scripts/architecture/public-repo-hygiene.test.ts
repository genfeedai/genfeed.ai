import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const OAUTH_CONTROLLER_FILES = [
  'apps/server/api/src/services/integrations/instagram/controllers/instagram.controller.ts',
  'apps/server/api/src/services/integrations/tiktok/controllers/tiktok.controller.ts',
] as const;

const PERSONAL_NGROK_URL = /https:\/\/[a-z0-9-]+\.ngrok-free\.app\/oauth\//i;

const RETIRED_EXPORTS = [
  {
    declaration: /export function createRouteMatcher\b/,
    file: 'packages/auth-client/src/server.ts',
  },
  {
    declaration: /export function authMiddleware\b/,
    file: 'packages/auth-client/src/server.ts',
  },
  {
    declaration: /export function assertObjectKeyWithinPrefix\b/,
    file: 'packages/storage/src/path-containment.ts',
  },
  {
    declaration: /\bassertObjectKeyWithinPrefix\b/,
    file: 'packages/storage/src/index.ts',
  },
  {
    declaration: /\bassertObjectKeyWithinPrefix\b/,
    file: 'packages/libs/security/index.ts',
  },
] as const;

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('public repository hygiene', () => {
  it.each(OAUTH_CONTROLLER_FILES)(
    'keeps the personal tunnel URL out of %s',
    (file) => {
      expect(readSource(file)).not.toMatch(PERSONAL_NGROK_URL);
    },
  );

  it.each(RETIRED_EXPORTS)(
    'keeps retired exports out of $file',
    ({ declaration, file }) => {
      expect(readSource(file)).not.toMatch(declaration);
    },
  );
});
