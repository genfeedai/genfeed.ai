/**
 * Guard: spec and test files must typecheck (#2407, #5244).
 *
 * Every backend workspace's `tsconfig.typecheck.json` excludes the `.spec.ts`,
 * `.test.ts`, and `.e2e-spec.ts` globs, and every frontend/package workspace's
 * own `tsconfig.json` excludes `.spec.ts(x)`/`.test.ts(x)` the same way.
 * Nothing else covers them: the root `type-check` script is only
 * `bunx turbo run type-check`, and no vitest config enables the `typecheck`
 * option. Test files were therefore typechecked nowhere.
 *
 * The concrete harm that motivated this guard: PR #2369 shipped a spec calling
 * `ModelsService.updateMany(filter, update)`, a method #2366 had already
 * deleted and which `BaseService` never had (its bulk-write path is
 * `patchAll`). A guaranteed runtime failure and an obvious type error that the
 * Typecheck job could not see. #5244 found the same gap in `apps/app` and the
 * `packages/*` workspaces: a mock or prop shape can drift from the type it
 * claims to satisfy and nothing but vitest's transpile-only runtime ever sees it.
 *
 * This guard runs each workspace's `tsconfig.typecheck.specs.json` — the same
 * compiler options as the shipping typecheck, with the spec excludes dropped
 * and the `test` directory added — and diffs the diagnostics against an exact
 * baseline. Workspaces are discovered under three roots: `apps/server` (one
 * subdirectory per backend service), `apps` (currently only `apps/app` has
 * opted in — other frontend/desktop apps are untouched), and `packages` (any
 * package with its own tests). A workspace enrolls itself purely by adding a
 * `tsconfig.typecheck.specs.json`; no root here needs editing to add one.
 *
 * `packages/*` spec configs widen `rootDir` to the repo root wherever the
 * shipping config restricts it (usually `./src`). TypeScript enforces rootDir
 * on every file that lands in the program, including ones pulled in only
 * through an import — and several path aliases point straight at a sibling
 * package's `src` rather than its built `dist` (`@genfeedai/helpers` from
 * `packages/serializers`, for example), so a test file's own import chain
 * routinely reaches outside `./src` once test files are no longer excluded.
 * Left alone that is TS6059, not a real finding. This is also why several
 * `packages/*` programs are large and slow: widening rootDir does not by
 * itself pull in more files, but the source-pointing aliases already did, so
 * a package with several such dependents ends up type-checking a large slice
 * of the monorepo on every run. Packages whose shipping config sets no
 * explicit `types` array (implicit-all: every `@types/*` package is already
 * visible) reference an `x/vitest-globals.d.ts` file instead of adding
 * `vitest/globals` to `types` directly, to avoid silently narrowing that
 * implicit set.
 *
 * Like the tenant-scope and workers `@api/*` ratchets, both directions fail:
 * a diagnostic missing from the baseline is a regression, and a baseline entry
 * that no longer reproduces is stale and must be pruned. Existing debt can
 * only ever shrink, and it moves only through a reviewed baseline change.
 *
 * This is a ratchet, not a proof. It inherits the typecheck configs' own
 * limits — `skipLibCheck` is on, so declaration files in `node_modules` are
 * unchecked — and it only sees files reachable from each workspace's include
 * globs. Baselined files can still hide new defects behind an already-recorded
 * diagnostic of the same shape; the count per fingerprint is the only ceiling.
 *
 * Regenerate with:
 *   bun run check:spec-typecheck --update-baseline
 * Packages must be built first (`bunx turbo run build --filter='./packages/*'`)
 * because the typecheck base config resolves `@genfeedai/contracts` and
 * `@genfeedai/contracts/constants` to their `dist` output.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_BASELINE_PATH =
  'scripts/architecture/spec-typecheck-baseline.json';
/**
 * Every workspace root the ratchet scans for a `tsconfig.typecheck.specs.json`.
 * `apps/server` and `packages` each hold many workspaces one directory deep;
 * `apps` holds several frontend/desktop apps but today only `apps/app` opts
 * in — the others simply have no spec tsconfig and are silently skipped by
 * `discoverSpecWorkspaces`.
 */
export const DEFAULT_WORKSPACE_ROOTS = [
  'apps/server',
  'apps',
  'packages',
] as const;
const SPEC_TSCONFIG_NAME = 'tsconfig.typecheck.specs.json';

const SPEC_TYPECHECK_BASELINE_VERSION = 2;
const SPEC_TYPECHECK_FINGERPRINT_PATTERN = /^[0-9a-f]{20}$/u;

const SPEC_TYPECHECK_BASELINE_ENTRY_KEYS = new Set([
  'code',
  'count',
  'file',
  'fingerprint',
  'message',
  'workspace',
]);

const SPEC_TYPECHECK_BASELINE_KEYS = new Set(['entries', 'version']);

const logger = {
  error: (message: string) => console.error(`[CheckSpecTypecheck] ${message}`),
  log: (message: string) => console.log(`[CheckSpecTypecheck] ${message}`),
};

export type SpecTypecheckFinding = {
  code: number;
  count: number;
  file: string;
  fingerprint: string;
  message: string;
  workspace: string;
};

export type SpecTypecheckBaselineEntry = SpecTypecheckFinding;

export type SpecTypecheckBaseline = {
  entries: SpecTypecheckBaselineEntry[];
  version: typeof SPEC_TYPECHECK_BASELINE_VERSION;
};

export type SpecTypecheckDiff = {
  regressions: SpecTypecheckFinding[];
  stale: SpecTypecheckBaselineEntry[];
};

export type SpecTypecheckOptions = {
  rootDir?: string;
  workspaces?: readonly string[];
  /** A single workspace root, or every root to scan. Defaults to {@link DEFAULT_WORKSPACE_ROOTS}. */
  workspacesDir?: string | readonly string[];
};

export type SpecTypecheckResult = {
  findings: SpecTypecheckFinding[];
  workspaces: string[];
};

type CliOptions = {
  baselinePath: string;
  collectJson: boolean;
  rootDir: string;
  updateBaseline: boolean;
  workspaces?: readonly string[];
  workspacesDirs: readonly string[];
};

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveFromRoot(rootDir: string, target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(rootDir, target);
}

/**
 * Workspaces are discovered by the presence of a spec tsconfig rather than
 * hard-coded, so adding one to a new backend workspace enrolls it in the
 * ratchet without editing this guard.
 */
export function discoverSpecWorkspaces(
  rootDir: string,
  workspacesDir: string,
): string[] {
  const absoluteDir = resolveFromRoot(rootDir, workspacesDir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  return ts.sys
    .getDirectories(absoluteDir)
    .filter((name) =>
      existsSync(path.join(absoluteDir, name, SPEC_TSCONFIG_NAME)),
    )
    .sort((left, right) => compareText(left, right));
}

function normalizeWorkspaceRoots(
  workspacesDir: string | readonly string[] | undefined,
): readonly string[] {
  if (workspacesDir === undefined) {
    return DEFAULT_WORKSPACE_ROOTS;
  }
  return typeof workspacesDir === 'string' ? [workspacesDir] : workspacesDir;
}

/**
 * Discovers every enrolled workspace across every configured root and maps
 * each one back to the root that owns it, so a later lookup does not have to
 * re-scan the filesystem to find which root a given workspace lives under.
 *
 * Workspace names must be unique across every root — `apps/server/api` and a
 * hypothetical `packages/api` enrolling at the same time would otherwise
 * silently collide in the baseline, which keys findings by workspace name
 * alone (unchanged from #2407, to keep every already-baselined backend entry
 * valid).
 */
export function discoverSpecWorkspacesAcrossRoots(
  rootDir: string,
  workspaceRoots: readonly string[],
): Map<string, string> {
  const workspaceRootByName = new Map<string, string>();

  for (const workspaceRoot of workspaceRoots) {
    for (const workspace of discoverSpecWorkspaces(rootDir, workspaceRoot)) {
      const existingRoot = workspaceRootByName.get(workspace);
      if (existingRoot !== undefined && existingRoot !== workspaceRoot) {
        throw new Error(
          `Workspace "${workspace}" is enrolled under both "${existingRoot}" and ` +
            `"${workspaceRoot}". Workspace names must be unique across every spec ` +
            'typecheck root.',
        );
      }
      workspaceRootByName.set(workspace, workspaceRoot);
    }
  }

  return workspaceRootByName;
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

const BUN_STORE_HASH_PATTERN = /(\/\.bun\/[^/]+)\+[0-9a-f]{8,}\//gu;

/**
 * TypeScript spells `import("...")` elaborations — the ones it reaches for when
 * two modules export the same type name — with an absolute path. Left alone,
 * every message carrying one would fingerprint differently on a developer
 * machine and in CI, so the ratchet would report the same diagnostic as both a
 * regression and a stale entry on every run. The bun store's content hash
 * (`sharp@0.35.3+7cb241fc07b679d9`) is dropped for the same reason.
 */
export function normalizeDiagnosticMessage(
  rootDir: string,
  message: string,
): string {
  return normalizePath(message)
    .split(normalizePath(rootDir))
    .join('<root>')
    .replace(BUN_STORE_HASH_PATTERN, '$1/');
}

function fingerprintForDiagnostic(
  workspace: string,
  file: string,
  code: number,
  sourceAnchor: string,
): string {
  return createHash('sha256')
    .update(`${workspace} ${file} ${code} ${sourceAnchor}`)
    .digest('hex')
    .slice(0, 20);
}

/**
 * Fingerprints use the diagnosed source line instead of TypeScript's rendered
 * message. Native declaration builds can legally emit union and object members
 * in a different order across platforms or cached artifacts; the legacy
 * compiler API then describes the same error differently. Source text remains
 * stable across those declaration-order changes and, unlike line/column, also
 * survives unrelated edits above the diagnostic.
 */
function canonicalizeSourceAnchor(value: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    value,
  );
  const tokens: string[] = [];
  let previousToken: ts.SyntaxKind | undefined;

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; ) {
    if (token === ts.SyntaxKind.Identifier) {
      const isBindingName =
        previousToken === ts.SyntaxKind.ConstKeyword ||
        previousToken === ts.SyntaxKind.LetKeyword ||
        previousToken === ts.SyntaxKind.VarKeyword;
      tokens.push(isBindingName ? '<binding>' : scanner.getTokenText());
    } else if (
      token === ts.SyntaxKind.StringLiteral ||
      token === ts.SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      tokens.push('<string>');
    } else if (
      token === ts.SyntaxKind.NumericLiteral ||
      token === ts.SyntaxKind.BigIntLiteral
    ) {
      tokens.push('<number>');
    } else if (
      token === ts.SyntaxKind.FalseKeyword ||
      token === ts.SyntaxKind.TrueKeyword
    ) {
      tokens.push('<boolean>');
    } else {
      tokens.push(scanner.getTokenText());
    }
    previousToken = token;
    token = scanner.scan();
  }

  return tokens.join(' ');
}

function sourceAnchorForDiagnostic(diagnostic: ts.Diagnostic): string {
  const sourceFile = diagnostic.file;
  const start = diagnostic.start;

  if (!sourceFile || start === undefined) {
    return '';
  }

  const lineStart = sourceFile.text.lastIndexOf('\n', start - 1) + 1;
  const nextLineBreak = sourceFile.text.indexOf('\n', start);
  const lineEnd = nextLineBreak === -1 ? sourceFile.text.length : nextLineBreak;
  return canonicalizeSourceAnchor(sourceFile.text.slice(lineStart, lineEnd));
}

function collectWorkspaceDiagnostics(
  rootDir: string,
  workspacesDir: string,
  workspace: string,
): SpecTypecheckFinding[] {
  const configPath = path.join(
    resolveFromRoot(rootDir, workspacesDir),
    workspace,
    SPEC_TSCONFIG_NAME,
  );

  const parseHost: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(
        `${workspace}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
      );
    },
  };

  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, parseHost);

  if (!parsed) {
    throw new Error(`Unable to parse ${normalizePath(configPath)}.`);
  }

  const program = ts.createProgram({
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    rootNames: parsed.fileNames,
  });

  const counts = new Map<string, SpecTypecheckFinding>();

  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (!diagnostic.file) {
      continue;
    }

    const file = normalizePath(
      path.relative(rootDir, diagnostic.file.fileName),
    );

    // `skipLibCheck` already suppresses most of these; the rest are third-party
    // declaration noise this repo cannot act on.
    if (file.includes('node_modules/')) {
      continue;
    }

    const message = normalizeDiagnosticMessage(
      rootDir,
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    );
    const fingerprint = fingerprintForDiagnostic(
      workspace,
      file,
      diagnostic.code,
      sourceAnchorForDiagnostic(diagnostic),
    );
    const existing = counts.get(fingerprint);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(fingerprint, {
      code: diagnostic.code,
      count: 1,
      file,
      fingerprint,
      message,
      workspace,
    });
  }

  return [...counts.values()];
}

function compareFindings(
  left: SpecTypecheckFinding,
  right: SpecTypecheckFinding,
): number {
  return (
    compareText(left.workspace, right.workspace) ||
    compareText(left.file, right.file) ||
    left.code - right.code ||
    compareText(left.fingerprint, right.fingerprint)
  );
}

export function runSpecTypecheck(
  options: SpecTypecheckOptions = {},
): SpecTypecheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const workspaceRoots = normalizeWorkspaceRoots(options.workspacesDir);
  const workspaceRootByName = discoverSpecWorkspacesAcrossRoots(
    rootDir,
    workspaceRoots,
  );
  const workspaces =
    options.workspaces ?? [...workspaceRootByName.keys()].sort(compareText);

  const findings = workspaces
    .flatMap((workspace) => {
      const workspaceRoot = workspaceRootByName.get(workspace);
      if (workspaceRoot === undefined) {
        throw new Error(
          `Unknown spec typecheck workspace "${workspace}". It has no ` +
            `${SPEC_TSCONFIG_NAME} under any of: ${workspaceRoots.join(', ')}.`,
        );
      }
      return collectWorkspaceDiagnostics(rootDir, workspaceRoot, workspace);
    })
    .sort(compareFindings);

  return { findings, workspaces: [...workspaces] };
}

function isBaselineEntry(value: unknown): value is SpecTypecheckBaselineEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry);

  return (
    keys.length === SPEC_TYPECHECK_BASELINE_ENTRY_KEYS.size &&
    keys.every((key) => SPEC_TYPECHECK_BASELINE_ENTRY_KEYS.has(key)) &&
    typeof entry.code === 'number' &&
    typeof entry.count === 'number' &&
    Number.isInteger(entry.count) &&
    entry.count > 0 &&
    typeof entry.file === 'string' &&
    typeof entry.fingerprint === 'string' &&
    SPEC_TYPECHECK_FINGERPRINT_PATTERN.test(entry.fingerprint) &&
    typeof entry.message === 'string' &&
    typeof entry.workspace === 'string'
  );
}

export function parseSpecTypecheckBaseline(
  contents: string,
): SpecTypecheckBaseline {
  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const keys = Object.keys(parsed);

  if (
    keys.length !== SPEC_TYPECHECK_BASELINE_KEYS.size ||
    !keys.every((key) => SPEC_TYPECHECK_BASELINE_KEYS.has(key)) ||
    parsed.version !== SPEC_TYPECHECK_BASELINE_VERSION ||
    !Array.isArray(parsed.entries) ||
    !parsed.entries.every(isBaselineEntry)
  ) {
    throw new Error(
      `Invalid spec-typecheck baseline. Expected version ${SPEC_TYPECHECK_BASELINE_VERSION}.`,
    );
  }

  const fingerprints = new Set<string>();
  for (const entry of parsed.entries) {
    if (fingerprints.has(entry.fingerprint)) {
      throw new Error(
        `Invalid spec-typecheck baseline: duplicate fingerprint ${entry.fingerprint}.`,
      );
    }
    fingerprints.add(entry.fingerprint);
  }

  return {
    entries: parsed.entries,
    version: SPEC_TYPECHECK_BASELINE_VERSION,
  };
}

/**
 * A fingerprint absent from the baseline, or one whose occurrence count grew,
 * is a regression. A baseline fingerprint that no longer reproduces at its
 * recorded count is stale. Both fail, so the recorded debt is a strict ceiling.
 */
export function diffSpecTypecheckBaseline(
  findings: readonly SpecTypecheckFinding[],
  baseline: readonly SpecTypecheckBaselineEntry[],
): SpecTypecheckDiff {
  const baselineByFingerprint = new Map(
    baseline.map((entry) => [entry.fingerprint, entry]),
  );
  const currentByFingerprint = new Map(
    findings.map((finding) => [finding.fingerprint, finding]),
  );

  const regressions = findings
    .filter((finding) => {
      const entry = baselineByFingerprint.get(finding.fingerprint);
      return !entry || finding.count > entry.count;
    })
    .sort(compareFindings);

  const stale = baseline
    .filter((entry) => {
      const finding = currentByFingerprint.get(entry.fingerprint);
      return !finding || finding.count < entry.count;
    })
    .sort(compareFindings);

  return { regressions, stale };
}

export function serializeSpecTypecheckBaseline(
  findings: readonly SpecTypecheckFinding[],
): string {
  const baseline: SpecTypecheckBaseline = {
    entries: [...findings].sort(compareFindings),
    version: SPEC_TYPECHECK_BASELINE_VERSION,
  };

  return `${JSON.stringify(baseline, null, 2)}\n`;
}

function readCliValue(
  arguments_: readonly string[],
  index: number,
  name: string,
): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseCliOptions(arguments_: readonly string[]): CliOptions {
  let rootDir = process.cwd();
  let baselinePath = DEFAULT_BASELINE_PATH;
  const workspacesDirs: string[] = [];
  let collectJson = false;
  let updateBaseline = false;
  const workspaces: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (!argument || argument === '--') {
      continue;
    }
    if (argument === '--update-baseline') {
      updateBaseline = true;
      continue;
    }
    if (argument === '--collect-json') {
      collectJson = true;
      continue;
    }
    if (argument === '--root-dir') {
      rootDir = readCliValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--baseline-path') {
      baselinePath = readCliValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--workspaces-dir') {
      // Repeatable; each occurrence adds one root instead of scanning every
      // default root. A single `--workspaces-dir apps/server` therefore
      // narrows a run to exactly that root, matching the pre-#5244 behavior.
      workspacesDirs.push(readCliValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (argument === '--workspace') {
      workspaces.push(readCliValue(arguments_, index, argument));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    baselinePath,
    collectJson,
    rootDir: path.resolve(rootDir),
    updateBaseline,
    workspaces: workspaces.length > 0 ? workspaces : undefined,
    workspacesDirs:
      workspacesDirs.length > 0 ? workspacesDirs : DEFAULT_WORKSPACE_ROOTS,
  };
}

function runIsolatedSpecTypecheck(options: CliOptions): SpecTypecheckResult {
  const workspaceRootByName = discoverSpecWorkspacesAcrossRoots(
    options.rootDir,
    options.workspacesDirs,
  );
  const workspaces = [...workspaceRootByName.keys()].sort(compareText);
  const findings: SpecTypecheckFinding[] = [];
  const entryPoint = process.argv[1];

  if (!entryPoint) {
    throw new Error('Unable to resolve the spec typecheck entry point.');
  }

  for (const workspace of workspaces) {
    const workspaceRoot = workspaceRootByName.get(workspace);
    if (workspaceRoot === undefined) {
      throw new Error(
        `Unable to resolve the root for workspace "${workspace}".`,
      );
    }
    const child = spawnSync(
      process.execPath,
      [
        entryPoint,
        '--root-dir',
        options.rootDir,
        '--workspaces-dir',
        workspaceRoot,
        '--workspace',
        workspace,
        '--collect-json',
      ],
      {
        cwd: options.rootDir,
        encoding: 'utf8',
        env: process.env,
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    if (child.error) {
      throw child.error;
    }
    if (child.status !== 0) {
      throw new Error(
        `Spec typecheck collection failed for ${workspace}: ${child.stderr.trim() || `exit ${child.status ?? 'unknown'}`}`,
      );
    }

    const result = JSON.parse(child.stdout) as SpecTypecheckResult;
    findings.push(...result.findings);
  }

  return { findings: findings.sort(compareFindings), workspaces };
}

function describeFinding(finding: SpecTypecheckFinding): string {
  const occurrences = finding.count > 1 ? ` (x${finding.count})` : '';
  return `- ${finding.file} TS${finding.code}${occurrences}: ${finding.message}`;
}

function describeStale(entry: SpecTypecheckBaselineEntry): string {
  return (
    `- ${entry.file} TS${entry.code} fingerprint=${entry.fingerprint}: ` +
    entry.message
  );
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));

  if (options.collectJson && !options.workspaces) {
    throw new Error('--collect-json requires --workspace.');
  }

  const result = options.workspaces
    ? runSpecTypecheck({
        rootDir: options.rootDir,
        workspaces: options.workspaces,
        workspacesDir: options.workspacesDirs,
      })
    : runIsolatedSpecTypecheck(options);

  if (options.collectJson) {
    process.stdout.write(JSON.stringify(result));
    return;
  }

  const baselinePath = resolveFromRoot(options.rootDir, options.baselinePath);

  if (options.updateBaseline) {
    // A partial run would silently drop every workspace it did not scan.
    if (options.workspaces) {
      throw new Error(
        '--update-baseline rewrites the whole baseline and cannot be combined with --workspace.',
      );
    }

    writeFileSync(
      baselinePath,
      serializeSpecTypecheckBaseline(result.findings),
    );
    logger.log(
      `Baseline rewritten with ${result.findings.length} distinct diagnostic(s) across ` +
        `${result.workspaces.length} workspace(s).`,
    );
    return;
  }

  const baseline = parseSpecTypecheckBaseline(
    readFileSync(baselinePath, 'utf8'),
  );
  const scoped = options.workspaces
    ? baseline.entries.filter((entry) =>
        options.workspaces?.includes(entry.workspace),
      )
    : baseline.entries;
  const diff = diffSpecTypecheckBaseline(result.findings, scoped);

  if (diff.regressions.length === 0 && diff.stale.length === 0) {
    logger.log(
      `Spec typecheck ratchet passed. ${result.findings.length} baselined diagnostic(s) across ` +
        `${result.workspaces.length} workspace(s), no new ones.`,
    );
    return;
  }

  if (diff.regressions.length > 0) {
    logger.error(
      'New spec typecheck error(s). Spec and test files must typecheck against their workspace config:',
    );
    for (const finding of diff.regressions) {
      logger.error(describeFinding(finding));
    }
  }

  if (diff.stale.length > 0) {
    logger.error(
      'Baseline is stale. Resolved entries must be pruned (run --update-baseline) so existing debt can only shrink:',
    );
    for (const entry of diff.stale) {
      logger.error(describeStale(entry));
    }
  }

  process.exit(1);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  }
}
