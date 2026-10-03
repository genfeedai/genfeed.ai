/**
 * Guardrail: product feature switches are Admin platform settings, not env
 * (#5407, #5468).
 *
 * A switch in env can only change with a deploy by someone holding the deploy
 * pipeline. Operator decisions about product behaviour — enabling a feature,
 * a rollout mode, a confidence threshold — belong on the platform-settings
 * singleton (`/admin/administration/platform-settings`), cached with
 * invalidation on write.
 *
 * This check fails when an env schema declares a key shaped like a product
 * flag (`*_ENABLED`, `*_MODE`, `*_MIN_CONFIDENCE`, `*_THRESHOLDS`, or any
 * `*FEATURE_FLAG*` key such as an env JSON of flag values) that is not
 * on the explicit infrastructure allow-list below. Adding to the allow-list is
 * a reviewed decision that the key is true infrastructure, not product
 * behaviour.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { PLATFORM_RUNTIME_ENV_MIGRATIONS } from '../migrations/platform-runtime-config.util';

/** Every place an env schema (Joi keys) is declared. */
const DEFAULT_SCHEMA_GLOBS = [
  'packages/config/src/schemas/**/*.ts',
  'packages/libs/config/config.service.ts',
  'apps/server/*/src/config/config.service.ts',
];

const DEFAULT_IGNORE_GLOBS = ['**/*.spec.ts', '**/*.test.ts'];

const PRODUCT_FLAG_PATTERNS: readonly RegExp[] = [
  /_ENABLED$/u,
  /_MODE$/u,
  /_MIN_CONFIDENCE$/u,
  /_THRESHOLDS$/u,
  /FEATURE_FLAG/u,
];

/**
 * Keys that match a product-flag pattern but are deployment infrastructure:
 * they decide whether a subsystem can run in this deployment at all, not how
 * the product behaves for customers.
 */
export const INFRASTRUCTURE_ENV_ALLOW_LIST: ReadonlySet<string> = new Set([
  // Whether the in-process auth handler is mounted (offline/local runs).
  'BETTER_AUTH_ENABLED',
  // Whether this process reports to Sentry.
  'SENTRY_ENABLED',
  // Whether this deployment has an isolated renderer endpoint and can admit sandbox jobs.
  'VISUAL_CODE_RENDERER_ENABLED',
  // Deployment transport admission; reviewed model registry owns product activation.
  'CRUN_ENABLED',
]);

/** A Joi schema key: `  KEY: Joi…` / `  KEY: conditionalRequired(…)`. */
const SCHEMA_KEY_PATTERN = /^\s+([A-Z][A-Z0-9_]*)\s*:/gmu;

export type EnvProductFlagViolation = {
  file: string;
  key: string;
  line: number;
};

export type EnvProductFlagResult = {
  scannedFileCount: number;
  violations: EnvProductFlagViolation[];
};

export type EnvProductFlagOptions = {
  allowList?: ReadonlySet<string>;
  ignoreGlobs?: string[];
  rootDir?: string;
  schemaGlobs?: string[];
};

export function isProductFlagKey(key: string): boolean {
  return (
    key === 'SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL' ||
    Object.hasOwn(PLATFORM_RUNTIME_ENV_MIGRATIONS, key) ||
    PRODUCT_FLAG_PATTERNS.some((pattern) => pattern.test(key))
  );
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function collectViolations(
  file: string,
  rootDir: string,
  allowList: ReadonlySet<string>,
): EnvProductFlagViolation[] {
  const source = readFileSync(path.join(rootDir, file), 'utf8');

  return [...source.matchAll(SCHEMA_KEY_PATTERN)].flatMap((match) => {
    const key = match[1] ?? '';
    return isProductFlagKey(key) && !allowList.has(key)
      ? [{ file, key, line: lineForOffset(source, match.index) }]
      : [];
  });
}

export function runCheckEnvProductFlags(
  options: EnvProductFlagOptions = {},
): EnvProductFlagResult {
  const rootDir = options.rootDir ?? process.cwd();
  const allowList = options.allowList ?? INFRASTRUCTURE_ENV_ALLOW_LIST;
  const files = globSync(options.schemaGlobs ?? DEFAULT_SCHEMA_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));

  return {
    scannedFileCount: files.length,
    violations: files.flatMap((file) =>
      collectViolations(file, rootDir, allowList),
    ),
  };
}

if (import.meta.main) {
  const result = runCheckEnvProductFlags();

  if (result.violations.length > 0) {
    console.error(
      'Product feature switches must be Admin platform settings, not env (#5407):',
    );
    for (const violation of result.violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.key}`);
    }
    console.error(
      'Move the switch onto the PlatformSetting singleton (typed default, superadmin-only write, cached read). If it is genuinely deployment infrastructure, add it to INFRASTRUCTURE_ENV_ALLOW_LIST with a one-line reason.',
    );
    process.exit(1);
  }

  console.log(
    `Env product-flag boundary passed across ${result.scannedFileCount} schema file(s).`,
  );
}
