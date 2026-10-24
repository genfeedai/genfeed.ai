/**
 * Guardrail: every provider credential the server reads is declared.
 *
 * A provider key that code reads but no template documents is invisible to
 * self-hosters and to the next agent, who then invents a second spelling or a
 * second enable flag (see `.agents/memory/context/provider-integration-pattern.md`).
 *
 * A credential-shaped key (`<PROVIDER>_API_KEY`, `<PROVIDER>_KEY`,
 * `<PROVIDER>_API_TOKEN`, `<PROVIDER>_SECRET`, ...) read through `ConfigService`
 * or `process.env` must appear in all four places:
 *
 *   1. `scripts/env-spec.ts`   (so `env:sync` places it)
 *   2. `.env.example`          (so people can find it)
 *   3. a Joi env schema        (so it is validated)
 *   4. the env-config typing   (so `ConfigService.get` is typed)
 *
 * Keys whose only gap predates this check sit on `LEGACY_UNDECLARED_KEYS`.
 * That list may only shrink: a stale entry fails the check too.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { parseTemplateKeys } from '../env-guard';

const DEFAULT_SOURCE_GLOBS = [
  'apps/server/*/src/**/*.ts',
  'packages/libs/**/*.ts',
];

const DEFAULT_SCHEMA_GLOBS = [
  'packages/config/src/schemas/**/*.ts',
  'packages/libs/config/config.service.ts',
  'apps/server/*/src/config/config.service.ts',
];

const DEFAULT_TYPING_GLOBS = [
  'packages/config/src/interfaces/env-config.interface.ts',
  'packages/libs/config/config.service.ts',
  'apps/server/*/src/config/config.service.ts',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/*.integration.spec.ts',
  '**/test/**',
  '**/__tests__/**',
  '**/__mocks__/**',
];

const ENV_SPEC_FILE = 'scripts/env-spec.ts';
const ENV_TEMPLATE_FILE = '.env.example';

/** One provider word, then a credential suffix: `FAL_API_KEY`, `REPLICATE_KEY`, `APIFY_API_TOKEN`. */
const PROVIDER_CREDENTIAL_KEY =
  /^[A-Z][A-Z0-9]*_(?:API_KEY|API_SECRET|API_TOKEN|KEY|SECRET|TOKEN)$/u;

/** `config.get<string>('KEY')`, `this.configService.get('KEY')`, `process.env.KEY`, `process.env['KEY']`. */
const KEY_READ_PATTERNS: readonly RegExp[] = [
  /\.get(?:<[^>]*>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"]/gu,
  /process\.env\.([A-Z][A-Z0-9_]*)/gu,
  /process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/gu,
];

/** A Joi schema key (`  KEY: Joi…`) or an interface member (`  KEY?: string`). */
const DECLARED_KEY_PATTERN = /^\s+([A-Z][A-Z0-9_]*)\??\s*:/gmu;

/**
 * Credential-shaped keys the server reads that are not provider keys, so the
 * four-place rule does not apply to them. Empty today; add an entry with a
 * one-line reason if a non-provider key ever matches the credential pattern.
 */
export const NON_PROVIDER_CREDENTIAL_KEYS: ReadonlySet<string> =
  new Set<string>([]);

/**
 * Provider keys read by code that predate this check and still miss a
 * declaration. Fix the gap and delete the entry; never add one.
 */
export const LEGACY_UNDECLARED_KEYS: ReadonlySet<string> = new Set<string>([]);

export type ProviderKeyDeclarationPlace =
  | 'env-spec'
  | 'env-template'
  | 'joi-schema'
  | 'typing';

export type ProviderKeyViolation = {
  file: string;
  key: string;
  line: number;
  missing: ProviderKeyDeclarationPlace[];
};

export type ProviderKeyDeclarationResult = {
  scannedFileCount: number;
  staleLegacyKeys: string[];
  violations: ProviderKeyViolation[];
};

export type ProviderKeyDeclarationOptions = {
  ignoreGlobs?: string[];
  legacyKeys?: ReadonlySet<string>;
  nonProviderKeys?: ReadonlySet<string>;
  rootDir?: string;
  schemaGlobs?: string[];
  sourceGlobs?: string[];
  typingGlobs?: string[];
};

export function isProviderCredentialKey(key: string): boolean {
  return PROVIDER_CREDENTIAL_KEY.test(key);
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function listFiles(
  globs: string[],
  rootDir: string,
  ignoreGlobs: string[],
): string[] {
  return globSync(globs, { cwd: rootDir, ignore: ignoreGlobs, nodir: true })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));
}

function readFile(rootDir: string, file: string): string {
  return readFileSync(path.join(rootDir, file), 'utf8');
}

function collectDeclaredKeys(
  files: string[],
  rootDir: string,
): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const file of files) {
    for (const match of readFile(rootDir, file).matchAll(
      DECLARED_KEY_PATTERN,
    )) {
      keys.add(match[1] ?? '');
    }
  }

  return keys;
}

function isListedInEnvSpec(source: string, key: string): boolean {
  return source.includes(`'${key}'`) || source.includes(`"${key}"`);
}

export function runCheckProviderKeyDeclarations(
  options: ProviderKeyDeclarationOptions = {},
): ProviderKeyDeclarationResult {
  const rootDir = options.rootDir ?? process.cwd();
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const legacyKeys = options.legacyKeys ?? LEGACY_UNDECLARED_KEYS;
  const nonProviderKeys =
    options.nonProviderKeys ?? NON_PROVIDER_CREDENTIAL_KEYS;

  const sourceFiles = listFiles(
    options.sourceGlobs ?? DEFAULT_SOURCE_GLOBS,
    rootDir,
    ignoreGlobs,
  );
  const envSpecSource = readFile(rootDir, ENV_SPEC_FILE);
  const templateKeys = parseTemplateKeys(readFile(rootDir, ENV_TEMPLATE_FILE));
  const schemaKeys = collectDeclaredKeys(
    listFiles(options.schemaGlobs ?? DEFAULT_SCHEMA_GLOBS, rootDir, []),
    rootDir,
  );
  const typingKeys = collectDeclaredKeys(
    listFiles(options.typingGlobs ?? DEFAULT_TYPING_GLOBS, rootDir, []),
    rootDir,
  );

  const violations: ProviderKeyViolation[] = [];
  const reported = new Set<string>();
  const legacyStillMissing = new Set<string>();

  for (const file of sourceFiles) {
    const source = readFile(rootDir, file);

    for (const pattern of KEY_READ_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const key = match[1] ?? '';

        if (
          !isProviderCredentialKey(key) ||
          nonProviderKeys.has(key) ||
          reported.has(key)
        ) {
          continue;
        }

        const missing: ProviderKeyDeclarationPlace[] = [];
        if (!isListedInEnvSpec(envSpecSource, key)) missing.push('env-spec');
        if (!templateKeys.has(key)) missing.push('env-template');
        if (!schemaKeys.has(key)) missing.push('joi-schema');
        if (!typingKeys.has(key)) missing.push('typing');

        if (missing.length === 0) continue;

        reported.add(key);

        if (legacyKeys.has(key)) {
          legacyStillMissing.add(key);
          continue;
        }

        violations.push({
          file,
          key,
          line: lineForOffset(source, match.index),
          missing,
        });
      }
    }
  }

  return {
    scannedFileCount: sourceFiles.length,
    staleLegacyKeys: [...legacyKeys]
      .filter((key) => !legacyStillMissing.has(key))
      .sort((left, right) => left.localeCompare(right)),
    violations,
  };
}

if (import.meta.main) {
  const result = runCheckProviderKeyDeclarations();

  if (result.violations.length > 0 || result.staleLegacyKeys.length > 0) {
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.key} is read but missing from: ${violation.missing.join(', ')}`,
      );
    }
    for (const key of result.staleLegacyKeys) {
      console.error(
        `- ${key} is on LEGACY_UNDECLARED_KEYS but is no longer undeclared (or no longer read): delete the entry`,
      );
    }
    console.error(
      'Declare a provider key in scripts/env-spec.ts, .env.example, a Joi schema in packages/config/src/schemas, and the env-config typing. See .agents/memory/context/provider-integration-pattern.md.',
    );
    process.exit(1);
  }

  console.log(
    `Provider key declarations passed across ${result.scannedFileCount} source file(s).`,
  );
}
