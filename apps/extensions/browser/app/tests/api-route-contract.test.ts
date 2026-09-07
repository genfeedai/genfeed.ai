import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const extensionRoot = resolve(root, 'apps/extensions/browser/app/src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(path)
        ? [path]
        : [];
  });
}

function normalizeRoute(route: string): string {
  return route
    .replace(/\$\{[^}]+\}/g, ':param')
    .split('?')[0]
    .replace(/:[^/]+/g, ':param')
    .replace(/^\/|\/$/g, '');
}

const apiRoutes = new Set(
  sourceFiles(resolve(root, 'apps/server/api/src')).flatMap((file) => {
    if (!file.endsWith('.controller.ts')) return [];
    const source = readFileSync(file, 'utf8');
    const prefix = source.match(/@Controller\(['"`]([^'"`]+)['"`]\)/)?.[1];
    if (!prefix) return [];
    return Array.from(
      source.matchAll(
        /@(Get|Post|Put|Patch|Delete)\((?:['"`]([^'"`]*)['"`])?\)/g,
      ),
      (match) =>
        `${match[1].toUpperCase()} ${normalizeRoute(`${prefix}/${match[2] ?? ''}`)}`,
    );
  }),
);

const routes = [
  ['POST', 'agent-tools/:name/execute'],
  ['POST', 'knowledge-sources'],
  ['POST', 'posts'],
  ['POST', 'prompts/tweet'],
  ['POST', 'images'],
  ['POST', 'videos'],
  ['GET', 'videos'],
  ['GET', 'videos/:id'],
  ['POST', 'agent/threads'],
  ['GET', 'agent/threads'],
  ['POST', 'agent/threads/:id/turns'],
  ['GET', 'agent/threads/:id/messages'],
  ['GET', 'agent/threads/:id/events'],
  ['GET', 'brands'],
  ['GET', 'contexts'],
  ['GET', 'credentials'],
  ['GET', 'users/me/settings'],
  ['GET', 'auth/whoami'],
  ['PATCH', 'users/me/settings'],
  ...[
    'twitter',
    'instagram',
    'linkedin',
    'facebook',
    'tiktok',
    'youtube',
  ].flatMap((platform) =>
    ['connect', 'verify'].map((action) => [
      'POST',
      `services/${platform}/${action}`,
    ]),
  ),
];

const routeInventory = new Set(
  routes.map(([, route]) => normalizeRoute(route)),
);

describe('extension API route contract', () => {
  it.each(routes)('%s /%s exists in an API controller', (method, route) => {
    expect(apiRoutes.has(`${method} ${normalizeRoute(route)}`)).toBe(true);
  });

  it('inventories every literal API endpoint used by the extension', () => {
    const files = [
      'background.ts',
      'services/auth.service.ts',
      'services/agent-tools.service.ts',
      'services/theme-settings.service.ts',
      'components/settings/ConnectedAccounts.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(extensionRoot, file), 'utf8');
      const endpoints = Array.from(
        source.matchAll(
          /['"`](?:\$\{(?:API_BASE|apiEndpoint)\})?(\/(?:agent(?:-tools|\/threads)|auth|knowledge-sources|posts|prompts|images|videos|threads|brands|contexts|credentials|users|services)[^'"`]*)['"`]/g,
        ),
        (match) => normalizeRoute(match[1]),
      );
      for (const route of endpoints)
        expect(routeInventory.has(route), `${file}: ${route}`).toBe(true);
    }
  });

  it('does not retain dead routes or fallback generation requests', () => {
    for (const file of sourceFiles(extensionRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const route of [
        '/ai/improve-tweet',
        '/ai/generate',
        '/posts/save',
        '/clip-projects/analyze',
        '/videos/create',
        '/auth/validate',
      ]) {
        expect(source, file).not.toContain(route);
      }
    }
    const remix = readFileSync(
      resolve(extensionRoot, 'components/pages/RemixPage.tsx'),
      'utf8',
    );
    expect(remix).not.toContain('/ingredients');
  });
});
