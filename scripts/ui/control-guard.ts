/**
 * control-guard.ts — the single canonical UI raw-control scanner.
 *
 * Replaces three overlapping scanners that had separate scopes and separate
 * allowlists:
 *   - scripts/check-raw-button-usage.ts   (raw <button> + button-like <a>/<Link>)
 *   - scripts/check-raw-ui-controls.ts    (raw <input>/<select> + legacy form imports)
 *   - scripts/lint-no-raw-html.sh         (all raw HTML primitives + dead wrapper imports)
 *
 * One entrypoint, one allowlist (`ALLOWLIST` below), one candidate-discovery
 * path. Rule categories stay separate in the output. Both CI (repo-wide, no
 * args) and lint-staged (changed files passed as args) call this same file, so
 * the two enforcement surfaces can never drift out of sync again.
 *
 * Detection parity with the three predecessors is preserved category by
 * category: each category keeps its original include scope, exclusions, and
 * regexes. This is a consolidation of *where the rules live*, not a change to
 * *what the rules catch*.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const logger = {
  error: (message: string) => console.error(`[control-guard] ${message}`),
  log: (message: string) => console.log(`[control-guard] ${message}`),
  warn: (message: string) => console.warn(`[control-guard] ${message}`),
};

// ─── Categories ────────────────────────────────────────────────────────────

export type ControlGuardCategory =
  | 'raw-html'
  | 'banned-import'
  | 'legacy-import'
  | 'raw-input'
  | 'raw-select'
  | 'raw-button'
  | 'styled-anchor';

export type ControlGuardSeverity = 'required' | 'advisory';

export type ControlGuardViolation = {
  category: ControlGuardCategory;
  file: string;
  line: number;
  severity: ControlGuardSeverity;
};

// ─── The ONE allowlist ───────────────────────────────────────────────────────
// Every tolerated-path / tolerated-file / native-exception decision lives here,
// grouped by the concern it serves. No other file carries UI-control allowlist
// state.
export const ALLOWLIST = {
  /**
   * Path segments where raw HTML primitives and dead-wrapper imports are the
   * legitimate implementation (the primitive wrappers themselves, editors,
   * form-field wrappers, etc.). Applied to `raw-html` and `banned-import`.
   * A file is skipped when its normalized path contains any of these.
   */
  primitiveWrapperSegments: [
    '/primitives/',
    '/buttons/base/',
    '/inputs/input/',
    '/inputs/textarea/',
    '/editors/',
    '/forms/inputs/',
    '/forms/selectors/',
    '/forms/upload/',
    '/forms/pickers/',
    '/display/table/',
    '/navigation/',
    '/feedback/',
    '/src/components/ui/',
    'packages/workflow-ui/',
  ],

  /**
   * Path segments where a native `<button>` / button-like anchor is acceptable.
   * Applied to `raw-button` and `styled-anchor`.
   */
  buttonPathSegments: ['/packages/ui/primitives/'],

  /**
   * Existing-debt baseline for `raw-button` / `styled-anchor`. These files are
   * grandfathered; new files are not. Kept as a set for O(1) membership.
   */
  buttonBaselineFiles: new Set<string>([
    'apps/app/app/(full-screen)/editor/page.tsx',
    'apps/website/app/(public)/agencies/agencies-content.tsx',
    'apps/website/app/(public)/articles/[slug]/article-detail.tsx',
    'apps/website/app/(public)/influencers/ai-influencers-content.tsx',
    'apps/website/packages/components/NotFoundContent.tsx',
    'apps/website/packages/components/content/post-card/PostCard.tsx',
    'apps/website/packages/components/home/_marketplace-cta.tsx',
    'packages/pages/analytics/overview/analytics-overview.tsx',
    'packages/pages/analytics/trend-turnover/analytics-trend-turnover.tsx',
    'packages/pages/automation/agents/new/AgentWizardPage.tsx',
    'packages/pages/automation/bots/BotsList.tsx',
    'packages/pages/brands/components/latest-articles/BrandDetailLatestArticles.tsx',
    'packages/pages/brands/components/latest-images/BrandDetailLatestImages.tsx',
    'packages/pages/brands/components/latest-videos/BrandDetailLatestVideos.tsx',
    'packages/pages/brands/components/sidebar/BrandDetailExternalLinksCard.tsx',
    'packages/pages/ingredients/detail/ingredient-detail.tsx',
    'packages/pages/mission-control/components/AgentRunCard.tsx',
    'packages/pages/not-found/not-found-page.tsx',
    'packages/pages/settings/help/settings-help-page.tsx',
    'packages/pages/settings/voice/settings-voice-page.tsx',
    'packages/pages/studio/page/StudioPageContent.tsx',
  ]),

  /**
   * `<input>` native types that are legitimate without a wrapper primitive.
   * Applied to `raw-input`.
   */
  allowedRawInputTypes: [/type=["']hidden["']/, /type=["']file["']/],

  /**
   * Guard-internal sources that legitimately embed the banned element/import
   * strings as rule *data* (regex literals). They are tooling, not shipped UI,
   * and must never be scanned or they would flag themselves. The `.test.` file
   * is already covered by the shared test-file exclusion.
   */
  selfReferenceFiles: new Set<string>(['scripts/ui/control-guard.ts']),
} as const;

// ─── Shared scope helpers ─────────────────────────────────────────────────────

const SHARED_EXCLUDE_SEGMENTS = ['/node_modules/', '/dist/', '/__mocks__/'];

function normalize(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function isTestLike(rel: string): boolean {
  return (
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel.includes('.stories.') ||
    rel.endsWith('.mdx') ||
    rel.endsWith('.md')
  );
}

function isGloballyExcluded(rel: string): boolean {
  const withLeadingSlash = `/${rel}`;
  return (
    isTestLike(rel) ||
    SHARED_EXCLUDE_SEGMENTS.some((segment) =>
      withLeadingSlash.includes(segment),
    )
  );
}

function hasExtension(rel: string, exts: readonly string[]): boolean {
  return exts.some((ext) => rel.endsWith(ext));
}

function hasPrefix(rel: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '' || rel.startsWith(prefix));
}

function containsSegment(rel: string, segments: readonly string[]): boolean {
  const withLeadingSlash = `/${rel}`;
  return segments.some((segment) =>
    segment.startsWith('/')
      ? withLeadingSlash.includes(segment)
      : rel.includes(segment),
  );
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function lineTextOf(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index - 1) + 1;
  const end = content.indexOf('\n', index);
  return content.slice(start, end === -1 ? content.length : end);
}

// ─── Rule definitions ─────────────────────────────────────────────────────────

const APP_PAGES_PREFIXES = ['apps/app/', 'packages/pages/'] as const;
// `packages/ui/workflow-builder/` currently resolves to nothing on disk; it is
// carried forward verbatim from check-raw-ui-controls so scope parity is exact
// and the entry starts enforcing the moment that directory is (re)introduced.
const APP_PAGES_WORKFLOW_BUILDER_PREFIXES = [
  ...APP_PAGES_PREFIXES,
  'packages/ui/workflow-builder/',
] as const;
const JSX_EXTS = ['.tsx', '.jsx'] as const;

type Scope = {
  prefixes: readonly string[];
  exts: readonly string[];
  /** Extra path-segment exclusions on top of the shared ones. */
  excludeSegments?: readonly string[];
};

type Rule = {
  category: ControlGuardCategory;
  severity: ControlGuardSeverity;
  scope: Scope;
  detect: (rel: string, content: string) => number[]; // returns violating lines
};

function inScope(rel: string, scope: Scope): boolean {
  if (isGloballyExcluded(rel)) {
    return false;
  }
  if (!hasExtension(rel, scope.exts) || !hasPrefix(rel, scope.prefixes)) {
    return false;
  }
  if (scope.excludeSegments && containsSegment(rel, scope.excludeSegments)) {
    return false;
  }
  return true;
}

const RAW_BUTTON_PATTERN = /<button(\s|>)/g;
const STYLED_ANCHOR_PATTERN =
  /<(a|Link)\b[\s\S]*?className="([^"]+)"[\s\S]*?>/g;
const LEGACY_IMPORT_PATTERNS = [
  /@ui\/inputs\/input\/Input/g,
  /@ui\/inputs\/select\/Select/g,
];
const RAW_INPUT_PATTERN = /<input\b[\s\S]*?>/g;
const RAW_SELECT_PATTERN = /<select\b[\s\S]*?>/g;
const RAW_HTML_ELEMENT_PATTERN =
  /<(input|button|textarea|select|dialog|table|details|summary|progress|hr)\b/g;
const BANNED_IMPORT_PATTERNS = [
  /@\/components\/ui\/input/g,
  /@\/components\/ui\/textarea/g,
  /@\/components\/ui\/select/g,
  /@\/features\/workflows\/components\/ui\/inputs\/input\/Input/g,
  /@\/features\/workflows\/components\/ui\/inputs\/textarea\/Textarea/g,
  /@\/features\/workflows\/components\/ui\/inputs\/select\/Select/g,
];

function isButtonLikeClassName(className: string): boolean {
  const hasInlineLayout =
    className.includes('inline-flex') || className.includes('items-center');
  const hasButtonBox =
    className.includes('rounded') ||
    className.includes('border') ||
    className.includes('px-') ||
    className.includes('py-');
  const hasInteraction =
    className.includes('hover:bg') || className.includes('cursor-pointer');
  const hasButtonWeight =
    className.includes('font-medium') || className.includes('font-black');

  return hasInlineLayout && hasButtonBox && (hasInteraction || hasButtonWeight);
}

function isCommentLine(text: string): boolean {
  return text.includes('{/*') || text.includes('*/');
}

function isButtonAllowed(rel: string): boolean {
  return (
    containsSegment(rel, ALLOWLIST.buttonPathSegments) ||
    ALLOWLIST.buttonBaselineFiles.has(rel)
  );
}

function matchLines(content: string, pattern: RegExp): number[] {
  const lines: number[] = [];
  for (const match of content.matchAll(pattern)) {
    lines.push(lineOf(content, match.index ?? 0));
  }
  return lines;
}

const RULES: readonly Rule[] = [
  {
    category: 'raw-button',
    severity: 'advisory',
    scope: { prefixes: APP_PAGES_PREFIXES, exts: JSX_EXTS },
    detect: (rel, content) =>
      isButtonAllowed(rel) ? [] : matchLines(content, RAW_BUTTON_PATTERN),
  },
  {
    category: 'styled-anchor',
    severity: 'advisory',
    scope: { prefixes: APP_PAGES_PREFIXES, exts: JSX_EXTS },
    detect: (rel, content) => {
      if (isButtonAllowed(rel)) {
        return [];
      }
      const lines: number[] = [];
      for (const match of content.matchAll(STYLED_ANCHOR_PATTERN)) {
        if (isButtonLikeClassName(match[2] ?? '')) {
          lines.push(lineOf(content, match.index ?? 0));
        }
      }
      return lines;
    },
  },
  {
    category: 'legacy-import',
    severity: 'required',
    scope: { prefixes: APP_PAGES_WORKFLOW_BUILDER_PREFIXES, exts: JSX_EXTS },
    detect: (_rel, content) =>
      LEGACY_IMPORT_PATTERNS.flatMap((pattern) => matchLines(content, pattern)),
  },
  {
    category: 'raw-input',
    severity: 'required',
    scope: { prefixes: APP_PAGES_WORKFLOW_BUILDER_PREFIXES, exts: JSX_EXTS },
    detect: (_rel, content) => {
      const lines: number[] = [];
      for (const match of content.matchAll(RAW_INPUT_PATTERN)) {
        if (
          ALLOWLIST.allowedRawInputTypes.some((pattern) =>
            pattern.test(match[0]),
          )
        ) {
          continue;
        }
        lines.push(lineOf(content, match.index ?? 0));
      }
      return lines;
    },
  },
  {
    category: 'raw-select',
    severity: 'required',
    scope: { prefixes: APP_PAGES_WORKFLOW_BUILDER_PREFIXES, exts: JSX_EXTS },
    detect: (_rel, content) => matchLines(content, RAW_SELECT_PATTERN),
  },
  {
    category: 'raw-html',
    severity: 'required',
    scope: {
      prefixes: [''],
      exts: ['.tsx'],
      excludeSegments: ALLOWLIST.primitiveWrapperSegments,
    },
    detect: (_rel, content) => {
      const lines: number[] = [];
      for (const match of content.matchAll(RAW_HTML_ELEMENT_PATTERN)) {
        const index = match.index ?? 0;
        // Ignore matches inside JSX comments {/* ... */}, matching the crude
        // but effective line filter used by the predecessor shell guard.
        if (isCommentLine(lineTextOf(content, index))) {
          continue;
        }
        lines.push(lineOf(content, index));
      }
      return lines;
    },
  },
  {
    category: 'banned-import',
    severity: 'required',
    scope: {
      prefixes: [''],
      exts: ['.ts', '.tsx'],
      excludeSegments: ALLOWLIST.primitiveWrapperSegments,
    },
    detect: (_rel, content) =>
      BANNED_IMPORT_PATTERNS.flatMap((pattern) => matchLines(content, pattern)),
  },
] as const;

// ─── Detection core (pure; unit-tested directly) ─────────────────────────────

/**
 * Run every rule over an explicit list of repo-relative files. This is the pure
 * heart of the guard: no filesystem discovery, no git, no cwd assumptions
 * beyond `rootDir` for reading. Both CLI modes funnel into this.
 */
export function detectViolations(
  files: readonly string[],
  rootDir: string,
): ControlGuardViolation[] {
  const violations: ControlGuardViolation[] = [];
  const seen = new Set<string>();

  for (const rawFile of files) {
    const rel = normalize(
      path.relative(rootDir, path.resolve(rootDir, rawFile)),
    );
    if (seen.has(rel) || ALLOWLIST.selfReferenceFiles.has(rel)) {
      continue;
    }
    seen.add(rel);

    const applicable = RULES.filter((rule) => inScope(rel, rule.scope));
    if (applicable.length === 0) {
      continue;
    }

    let content: string;
    try {
      content = readFileSync(path.resolve(rootDir, rel), 'utf-8');
    } catch {
      continue; // deleted/unreadable staged path — nothing to scan
    }

    for (const rule of applicable) {
      for (const line of rule.detect(rel, content)) {
        violations.push({
          category: rule.category,
          file: rel,
          line,
          severity: rule.severity,
        });
      }
    }
  }

  return violations.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

// ─── Candidate discovery (repo-wide / CI mode) ───────────────────────────────

// Union of the bounded rule scopes — globbed in full so button-like anchors
// (which carry no element tag for git-grep to key on) are never missed.
const BOUNDED_GLOBS = [
  'apps/app/**/*.{tsx,jsx}',
  'packages/pages/**/*.{tsx,jsx}',
  'packages/ui/workflow-builder/**/*.{tsx,jsx}',
];
const BOUNDED_GLOB_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
  '**/__mocks__/**',
];

// Cheap first-pass filter for the repo-wide rules (raw-html + banned-import).
// `git grep` ignores `\b`, so the anchors are dropped here; the precise per-file
// regexes re-narrow. Over-inclusion only adds candidates the detector clears.
function repoWideGitGrepFilter(): string {
  const elements =
    'input|button|textarea|select|dialog|table|details|summary|progress|hr';
  const imports = [
    '@/components/ui/input',
    '@/components/ui/textarea',
    '@/components/ui/select',
    '@/features/workflows/components/ui/inputs/input/Input',
    '@/features/workflows/components/ui/inputs/textarea/Textarea',
    '@/features/workflows/components/ui/inputs/select/Select',
  ].join('|');
  return `<(${elements})|${imports}`;
}

function tryGitGrepCandidates(rootDir: string): string[] | null {
  const result = spawnSync(
    'git',
    ['grep', '-lE', repoWideGitGrepFilter(), '--', '*.ts', '*.tsx'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  // git grep: 0 = matches, 1 = no matches (still a valid empty result),
  // >1 or spawn failure (e.g. not a git repo) = fall back to glob.
  if (result.error || result.status === null || result.status > 1) {
    return null;
  }
  return result.stdout.split('\n').filter(Boolean);
}

function globRepoWideCandidates(rootDir: string): string[] {
  return globSync(['**/*.{ts,tsx,jsx}'], {
    cwd: rootDir,
    ignore: BOUNDED_GLOB_IGNORE,
    nodir: true,
  });
}

function discoverCandidates(rootDir: string): string[] {
  const bounded = globSync(BOUNDED_GLOBS, {
    cwd: rootDir,
    ignore: BOUNDED_GLOB_IGNORE,
    nodir: true,
  });
  const repoWide =
    tryGitGrepCandidates(rootDir) ?? globRepoWideCandidates(rootDir);
  return [...new Set([...bounded, ...repoWide])];
}

// ─── Public run entrypoint ───────────────────────────────────────────────────

export type RunOptions = {
  /** Explicit file list (lint-staged / tests). Omit for repo-wide discovery. */
  files?: readonly string[];
  rootDir?: string;
};

export function runControlGuard(options: RunOptions = {}): {
  violations: ControlGuardViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const files = options.files ?? discoverCandidates(rootDir);
  return { violations: detectViolations(files, rootDir) };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

const CATEGORY_ORDER: readonly ControlGuardCategory[] = [
  'raw-html',
  'banned-import',
  'legacy-import',
  'raw-input',
  'raw-select',
  'raw-button',
  'styled-anchor',
];

const CATEGORY_HINTS: Record<ControlGuardCategory, string> = {
  'raw-html': 'Use @ui/primitives/* instead of raw HTML elements.',
  'banned-import':
    'Import primitives from @ui/primitives/*, not dead wrappers.',
  'legacy-import': 'Replace @ui/inputs/* legacy imports with @ui/primitives/*.',
  'raw-input': 'Use the shared Input primitive (hidden/file inputs excepted).',
  'raw-select': 'Use the shared Select primitive.',
  'raw-button': 'Use the shared Button primitive.',
  'styled-anchor': 'Use Button/AppLink instead of a button-styled anchor.',
};

function reportAndExit(violations: ControlGuardViolation[]): void {
  const required = violations.filter((v) => v.severity === 'required');
  const advisory = violations.filter((v) => v.severity === 'advisory');

  const byCategory = new Map<ControlGuardCategory, ControlGuardViolation[]>();
  for (const violation of violations) {
    const bucket = byCategory.get(violation.category) ?? [];
    bucket.push(violation);
    byCategory.set(violation.category, bucket);
  }

  for (const category of CATEGORY_ORDER) {
    const bucket = byCategory.get(category);
    if (!bucket || bucket.length === 0) {
      continue;
    }
    const severity = bucket[0]?.severity ?? 'required';
    const emit = severity === 'required' ? logger.error : logger.warn;
    emit(
      `${category} (${severity}): ${bucket.length} violation(s). ${CATEGORY_HINTS[category]}`,
    );
    for (const violation of bucket) {
      emit(`  - ${violation.file}:${violation.line}`);
    }
  }

  if (required.length > 0) {
    logger.error(
      `Failed: ${required.length} required UI-control violation(s). Use @ui/primitives/*.`,
    );
    process.exit(1);
  }

  if (advisory.length > 0) {
    logger.warn(
      `Required UI-control guards passed. ${advisory.length} advisory violation(s) reported as existing debt.`,
    );
    process.exit(0);
  }

  logger.log('No raw UI controls found.');
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  // No args → repo-wide (CI). File args → changed-files mode (lint-staged).
  const fileArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const { violations } = runControlGuard(
    fileArgs.length > 0 ? { files: fileArgs } : {},
  );
  reportAndExit(violations);
}
