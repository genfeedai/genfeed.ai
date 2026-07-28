import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTED_SERVICES = [
  { directory: 'apps/app', runnerPath: '../../', service: 'app' },
  { directory: 'apps/docs', runnerPath: '../../', service: 'docs' },
  {
    directory: 'apps/server/api',
    runnerPath: '../../../',
    service: 'api',
  },
  {
    directory: 'apps/server/files',
    runnerPath: '../../../',
    service: 'files',
  },
  {
    directory: 'apps/server/mcp',
    runnerPath: '../../../',
    service: 'mcp',
  },
  {
    directory: 'apps/server/notifications',
    runnerPath: '../../../',
    service: 'notifications',
  },
  { directory: 'apps/website', runnerPath: '../../', service: 'website' },
] as const;

const DEFAULT_SCRIPT_EXPECTATIONS = {
  dev: 'bun run dev:portless:all',
  'dev:all': 'bun run dev:portless:all',
  'dev:app': 'bun run dev:portless:app',
  'dev:app:be': 'bun run dev:portless:essentials',
  'dev:app:fe': 'bun run dev:portless:app',
  'dev:backend': 'bun run dev:portless:backend',
  'dev:docs': 'bun run dev:portless:docs',
  'dev:essentials': 'bun run dev:portless:essentials',
  'dev:frontend': 'bun run dev:portless:frontend',
  'dev:website:fe': 'bun run dev:portless:website',
} as const;

type PackageManifest = {
  scripts?: Record<string, string>;
};

type PortlessConfig = {
  apps?: Record<string, { name?: string; script?: string }>;
};

export type PortlessContractViolation = {
  message: string;
  path: string;
};

function readJson<T>(rootDir: string, relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(rootDir, relativePath), 'utf8'),
  ) as T;
}

export function checkPortlessContract(
  rootDir = process.cwd(),
): PortlessContractViolation[] {
  const violations: PortlessContractViolation[] = [];
  const rootManifest = readJson<PackageManifest>(rootDir, 'package.json');
  const rootScripts = rootManifest.scripts ?? {};
  const portlessConfig = readJson<PortlessConfig>(rootDir, 'portless.json');

  for (const [script, expected] of Object.entries(
    DEFAULT_SCRIPT_EXPECTATIONS,
  )) {
    if (rootScripts[script] !== expected) {
      violations.push({
        message: `${script} must be "${expected}"`,
        path: 'package.json',
      });
    }
  }

  for (const route of ROUTED_SERVICES) {
    const manifestPath = `${route.directory}/package.json`;
    const manifest = readJson<PackageManifest>(rootDir, manifestPath);
    const expectedScript = `bun run ${route.runnerPath}scripts/dev/run-portless.ts ${route.service} -- bun run dev:direct`;
    const configuredRoute = portlessConfig.apps?.[route.directory];

    if (manifest.scripts?.['dev:portless'] !== expectedScript) {
      violations.push({
        message: `dev:portless must be "${expectedScript}"`,
        path: manifestPath,
      });
    }

    if (manifest.scripts?.['dev:direct'] === undefined) {
      violations.push({
        message: 'dev:direct is required as the explicit fixed-port fallback',
        path: manifestPath,
      });
    }

    if (
      configuredRoute?.name !== `${route.service}.genfeed` ||
      configuredRoute.script !== 'dev:direct'
    ) {
      violations.push({
        message: `route must map ${route.service}.genfeed to dev:direct`,
        path: 'portless.json',
      });
    }
  }

  const concurrencyExpectations = [
    ['dev:portless:all', '--concurrency=9'],
    ['dev:portless:backend', '--concurrency=6'],
    ['dev:portless:essentials', '--concurrency=3'],
    ['dev:portless:frontend', '--concurrency=3'],
  ] as const;

  for (const [script, concurrency] of concurrencyExpectations) {
    if (!rootScripts[script]?.includes(concurrency)) {
      violations.push({
        message: `${script} must reserve enough Turbo concurrency with ${concurrency}`,
        path: 'package.json',
      });
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkPortlessContract();

  if (violations.length > 0) {
    console.error('Portless local-development contract violations found:');
    for (const violation of violations) {
      console.error(`- ${violation.path}: ${violation.message}`);
    }
    process.exit(1);
  }

  console.log('Portless local-development contract guard passed.');
}
