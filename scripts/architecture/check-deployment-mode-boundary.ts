import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx}',
  'packages/**/*.{cjs,js,mjs,ts,tsx}',
];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.*',
  '**/*.test.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

const RAW_MODE_ENV_PATTERN =
  /process\.env\.(?:GENFEED_CLOUD|NEXT_PUBLIC_GENFEED_CLOUD|NEXT_PUBLIC_DESKTOP_SHELL)/gu;
const RAW_AUTH_ENV_PATTERN =
  /process\.env\.(?:BETTER_AUTH_ENABLED|NEXT_PUBLIC_BETTER_AUTH_ENABLED)/gu;
const RAW_LICENSE_ENV_PATTERN =
  /process\.env\.(?:GENFEED_LICENSE_KEY|NEXT_PUBLIC_GENFEED_LICENSE_KEY)/gu;
const LEGACY_MODE_PATTERN =
  /\b(?:GENFEED_MODE|GenfeedMode|IS_BETTER_AUTH_ENABLED|IS_CLOUD|IS_CLOUD_MODE|IS_HYBRID_MODE|IS_LOCAL_MODE|IS_SELF_HOSTED|isCloudConnected|isHostedCloudApp|isOfficialHostedAppHost)\b/gu;
const FRONTEND_EDITION_IMPORT_PATTERN =
  /(?:@\/lib\/config\/edition|src\/lib\/config\/edition)/gu;

export type DeploymentModeBoundaryReason =
  | 'frontend-edition-import'
  | 'legacy-mode-api'
  | 'raw-auth-env'
  | 'raw-license-env'
  | 'raw-mode-env';

export type RawEnvBoundaryReason = Extract<
  DeploymentModeBoundaryReason,
  `raw-${string}`
>;

export type DeploymentModeBoundaryViolation = {
  file: string;
  line: number;
  match: string;
  reason: DeploymentModeBoundaryReason;
};

const RAW_ENV_CHECKS: readonly (readonly [RegExp, RawEnvBoundaryReason])[] = [
  [RAW_AUTH_ENV_PATTERN, 'raw-auth-env'],
  [RAW_LICENSE_ENV_PATTERN, 'raw-license-env'],
  [RAW_MODE_ENV_PATTERN, 'raw-mode-env'],
];

/**
 * Raw environment reads are exempted per file **and per axis**: a module that
 * legitimately owns one axis (license, auth, or mode) stays checked on the
 * other two, so `license-server.ts` cannot quietly grow a raw auth or mode read.
 */
const RAW_ENV_ALLOWLIST = new Map<string, ReadonlySet<RawEnvBoundaryReason>>([
  ['apps/app/next.config.ts', new Set(['raw-mode-env'])],
  ['packages/auth-client/src/config.ts', new Set(['raw-auth-env'])],
  ['packages/config/src/deployment.ts', new Set(['raw-mode-env'])],
  ['packages/config/src/license-server.ts', new Set(['raw-license-env'])],
  ['packages/config/src/license.ts', new Set(['raw-license-env'])],
]);

const NO_EXEMPTIONS: ReadonlySet<RawEnvBoundaryReason> = new Set();

export type DeploymentModeBoundaryOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function collectMatches(
  source: string,
  pattern: RegExp,
  file: string,
  reason: DeploymentModeBoundaryReason,
): DeploymentModeBoundaryViolation[] {
  return [...source.matchAll(pattern)].map((match) => ({
    file,
    line: lineForOffset(source, match.index),
    match: match[0],
    reason,
  }));
}

export function checkDeploymentModeBoundary(
  options: DeploymentModeBoundaryOptions = {},
): DeploymentModeBoundaryViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));

  return files.flatMap((file) => {
    const normalizedFile = file.replaceAll('\\', '/');
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    const violations = [
      ...collectMatches(
        source,
        LEGACY_MODE_PATTERN,
        normalizedFile,
        'legacy-mode-api',
      ),
      ...collectMatches(
        source,
        FRONTEND_EDITION_IMPORT_PATTERN,
        normalizedFile,
        'frontend-edition-import',
      ),
    ];

    const exemptReasons =
      RAW_ENV_ALLOWLIST.get(normalizedFile) ?? NO_EXEMPTIONS;
    for (const [pattern, reason] of RAW_ENV_CHECKS) {
      if (exemptReasons.has(reason)) {
        continue;
      }

      violations.push(
        ...collectMatches(source, pattern, normalizedFile, reason),
      );
    }

    return violations;
  });
}

if (import.meta.main) {
  const violations = checkDeploymentModeBoundary();

  if (violations.length > 0) {
    console.error(
      'Deployment mode boundary violations:\n' +
        violations
          .map(
            ({ file, line, match, reason }) =>
              `- ${file}:${line} [${reason}] ${match}`,
          )
          .join('\n'),
    );
    process.exit(1);
  }

  console.log('Deployment mode boundary passed.');
}
