import { existsSync, readFileSync } from 'node:fs';
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

const RETIRED_MEDIA_SERVICES = ['images', 'videos', 'voices'] as const;

const MEDIA_RUNTIME_REFERENCE_FILES = [
  '.github/workflows/build-verify.yml',
  'bun.lock',
  'docker/Dockerfile',
  'docker/Dockerfile.selfhosted',
  'docker/Dockerfile.server',
  'knip.config.ts',
] as const;

const MEDIA_ALIAS_FILES = [
  'apps/server/tsconfig.json',
  'apps/server/tsconfig.typecheck.base.json',
  'apps/server/workers/tsconfig.app.json',
] as const;

const RETIRED_FLEET_CONTROL_PATHS = [
  'apps/app/app/(protected)/admin/fleet',
  'apps/server/api/src/endpoints/admin/fleet',
  'apps/server/api/src/services/integrations/fleet',
  'apps/server/api/src/services/integrations/fleet',
  'packages/services/admin/fleet.service.ts',
  'playwright/e2e/tests/admin/admin-fleet.spec.ts',
] as const;

const FLEET_CONTROL_REFERENCE_FILES = [
  'apps/app/packages/config/admin-menu-items.config.ts',
  'apps/app/src/lib/workspace-shell/workspace-shell-registry.ts',
  'packages/contracts/src/constants/api.constant.ts',
  'packages/contracts/src/constants/routes.constant.ts',
  'playwright/e2e/fixtures/api-mocks.fixture.ts',
  'playwright/e2e/fixtures/test-data.fixture.ts',
  'playwright/e2e/pages/admin.page.ts',
  'playwright/e2e/tests/smoke/all-app-pages.spec.ts',
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

  it.each(RETIRED_MEDIA_SERVICES)(
    'keeps the public %s GPU runtime retired',
    (service) => {
      expect(existsSync(path.join(REPO_ROOT, `apps/server/${service}`))).toBe(
        false,
      );
      expect(
        existsSync(
          path.join(REPO_ROOT, `docker/docker-compose.${service}.yml`),
        ),
      ).toBe(false);

      for (const file of MEDIA_RUNTIME_REFERENCE_FILES) {
        const source = readSource(file);
        expect(source).not.toContain(`@genfeedai/${service}`);
        expect(source).not.toContain(`apps/server/${service}`);
      }

      for (const file of MEDIA_ALIAS_FILES) {
        expect(readSource(file)).not.toContain(`@${service}/*`);
      }

      const nestProjects = JSON.parse(
        readSource('apps/server/nest-cli.json'),
      ) as { projects?: Record<string, unknown> };
      expect(nestProjects.projects).not.toHaveProperty(service);

      expect(readSource('docker/docker-compose.yml')).not.toContain(
        `target: ${service}`,
      );
    },
  );

  it.each(RETIRED_FLEET_CONTROL_PATHS)(
    'keeps the public Fleet control plane retired at %s',
    (retiredPath) => {
      expect(existsSync(path.join(REPO_ROOT, retiredPath))).toBe(false);
    },
  );

  it.each(FLEET_CONTROL_REFERENCE_FILES)(
    'keeps public Fleet routes out of %s',
    (file) => {
      expect(readSource(file)).not.toContain('/admin/fleet');
    },
  );

  it('retains only the managed-inference runtime adapter', () => {
    expect(
      existsSync(
        path.join(
          REPO_ROOT,
          'apps/server/api/src/services/integrations/managed-inference-runtime/managed-inference-runtime.service.ts',
        ),
      ),
    ).toBe(true);
  });
});
