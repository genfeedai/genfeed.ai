import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PORTLESS_PROXY_ENVIRONMENT } from '../dev/portless-env';
import { PORTLESS_SERVICE_INSTALL_ARGS } from '../dev/setup-portless';

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
  'dev:doctor': 'bun run scripts/dev/setup-portless.ts --check',
  'dev:setup': 'bun run scripts/dev/setup-portless.ts',
  'dev:all': 'bun run dev:portless:all',
  'dev:app': 'bun run dev:portless:app',
  'dev:app:be': 'bun run dev:portless:essentials',
  'dev:app:fe': 'bun run dev:portless:app',
  'dev:backend': 'bun run dev:portless:backend',
  'dev:direct:all': 'bunx turbo run dev:direct',
  'dev:docs': 'bun run dev:portless:docs',
  'dev:essentials': 'bun run dev:portless:essentials',
  'dev:frontend': 'bun run dev:portless:frontend',
  'dev:website:fe': 'bun run dev:portless:website',
} as const;

type PackageManifest = {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PortlessConfig = {
  apps?: Record<string, { name?: string; script?: string }>;
};

const CANONICAL_ENV_ENDPOINTS = {
  API_URL: 'https://api.genfeed.localhost',
  BETTER_AUTH_URL: 'https://api.genfeed.localhost',
  GENFEEDAI_API_URL: 'https://api.genfeed.localhost',
  GENFEEDAI_APP_URL: 'https://app.genfeed.localhost',
  GENFEEDAI_MICROSERVICES_FILES_URL: 'https://files.genfeed.localhost',
  GENFEEDAI_MICROSERVICES_MCP_URL: 'https://mcp.genfeed.localhost',
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
    'https://notifications.genfeed.localhost',
  GENFEEDAI_PUBLIC_URL: 'https://website.genfeed.localhost',
  NEXT_PUBLIC_API_ENDPOINT: 'https://app.genfeed.localhost/v1',
  NEXT_PUBLIC_API_URL: 'https://app.genfeed.localhost/v1',
  NEXT_PUBLIC_MCP_ENDPOINT: 'https://mcp.genfeed.localhost/mcp',
  NEXT_PUBLIC_WS_ENDPOINT: 'https://notifications.genfeed.localhost',
} as const;

const ROUTED_PORT_ENV_KEYS = [
  'API_PORT',
  'APP_PORT',
  'DOCS_PORT',
  'FILES_PORT',
  'MCP_PORT',
  'NOTIFICATIONS_PORT',
  'WEBSITE_PORT',
] as const;

export type PortlessContractViolation = {
  message: string;
  path: string;
};

function readJson<T>(rootDir: string, relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(rootDir, relativePath), 'utf8'),
  ) as T;
}

/**
 * Parse a dotenv-style file. Split on `/\r?\n/` so CRLF checkouts do not leave
 * trailing `\r` on values (which would break exact endpoint comparisons).
 */
export function parseEnvExample(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0 || line.startsWith('#')) {
      continue;
    }
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function readEnv(
  rootDir: string,
  relativePath: string,
): Record<string, string> {
  return parseEnvExample(
    readFileSync(path.join(rootDir, relativePath), 'utf8'),
  );
}

export function checkPortlessContract(
  rootDir = process.cwd(),
): PortlessContractViolation[] {
  const violations: PortlessContractViolation[] = [];
  const rootManifest = readJson<PackageManifest>(rootDir, 'package.json');
  const rootScripts = rootManifest.scripts ?? {};
  const portlessConfig = readJson<PortlessConfig>(rootDir, 'portless.json');
  const rootEnvironment = readEnv(rootDir, '.env.example');
  const portlessRunner = readFileSync(
    path.join(rootDir, 'scripts/dev/run-portless.ts'),
    'utf8',
  );
  const portlessSetup = readFileSync(
    path.join(rootDir, 'scripts/dev/setup-portless.ts'),
    'utf8',
  );

  if (
    PORTLESS_PROXY_ENVIRONMENT.PORTLESS_HTTPS !== '1' ||
    PORTLESS_PROXY_ENVIRONMENT.PORTLESS_PORT !== '443' ||
    PORTLESS_PROXY_ENVIRONMENT.PORTLESS_SYNC_HOSTS !== '0' ||
    PORTLESS_PROXY_ENVIRONMENT.PORTLESS_TLD !== 'localhost' ||
    !portlessRunner.includes('...PORTLESS_PROXY_ENVIRONMENT')
  ) {
    violations.push({
      message:
        'Portless must enforce HTTPS on 443 with .localhost routes and hosts-file synchronization disabled',
      path: 'scripts/dev/run-portless.ts',
    });
  }

  if (rootManifest.devDependencies?.portless !== '0.15.4') {
    violations.push({
      message:
        'Portless must remain an exact, repository-owned development dependency at version 0.15.4',
      path: 'package.json',
    });
  }

  if (
    PORTLESS_SERVICE_INSTALL_ARGS.join(' ') !==
      'service install --https --port 443 --tld localhost' ||
    !portlessSetup.includes('...PORTLESS_PROXY_ENVIRONMENT')
  ) {
    violations.push({
      message:
        'dev:setup must install the Portless HTTPS startup service on port 443 with .localhost routes',
      path: 'scripts/dev/setup-portless.ts',
    });
  }

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

    const directRunner = `scripts/dev/run-direct.ts ${route.service} --`;
    if (!manifest.scripts?.['dev:direct']?.includes(directRunner)) {
      violations.push({
        message: `dev:direct must inject the ${route.service} fixed-port environment through run-direct.ts`,
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

  for (const [key, expectedValue] of Object.entries(CANONICAL_ENV_ENDPOINTS)) {
    if (rootEnvironment[key] !== expectedValue) {
      violations.push({
        message: `${key} must be "${expectedValue}"`,
        path: '.env.example',
      });
    }
  }

  for (const key of ROUTED_PORT_ENV_KEYS) {
    if (rootEnvironment[key] !== undefined) {
      violations.push({
        message: `${key} belongs to the direct/E2E/Docker boundary, not the canonical environment example`,
        path: '.env.example',
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
