/**
 * The single reviewed exclusion policy for changed-code coverage (#1849).
 *
 * Every rule answers one question: "can a coverage report ever attribute an
 * executable line to this path?" A path is excluded only when the answer is a
 * provable no — the file emits no executable code, is generated rather than
 * authored, is test scaffolding, or is deliberately outside every instrumented
 * suite. Anything else stays measured so the observation phase collects honest
 * evidence instead of a flattering number.
 *
 * Rules are ordered and first-match-wins. Adding, widening, or removing a rule
 * is a reviewed policy change: `changed-code-coverage.test.mjs` pins the
 * classification of representative paths, including the near-misses that must
 * NOT be excluded (serializer `*.config.ts` triplets, product `index.ts`
 * barrels outside the server tier, Next.js `proxy.ts`).
 */

/** Extensions that can carry line and branch coverage at all. */
const EXECUTABLE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;

/** Declaration files: types only, zero emitted statements. */
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/**
 * Config/setup files owned by a tool rather than the product. Deliberately an
 * explicit tool list — a bare `*.config.ts` pattern would swallow the
 * `{name}.config.ts` leg of every serializer triplet, which is real
 * first-party logic.
 */
const TOOLING_CONFIG =
  /(?:^|\/)(?:vitest|vite|next|tailwind|postcss|biome|knip|commitlint|lint-staged|turbo|playwright(?:-[a-z0-9-]+)?|sentry\.[a-z]+)\.(?:config|setup)\.[cm]?[jt]sx?$/;

export const CHANGED_CODE_COVERAGE_EXCLUSIONS = [
  {
    id: 'non-executable-extension',
    category: 'non-executable',
    reason:
      'Only TypeScript/JavaScript sources can carry line and branch coverage.',
    matches: (file) => !EXECUTABLE_EXTENSION.test(file),
  },
  {
    id: 'declaration-only',
    category: 'declaration',
    reason: 'Ambient declaration files emit no executable statements.',
    matches: (file) => DECLARATION_FILE.test(file),
  },
  {
    id: 'vendored-or-build-output',
    category: 'generated',
    reason:
      'Vendored dependencies and build output are not authored first-party sources.',
    matches: (file) =>
      /(?:^|\/)(?:node_modules|dist|build|out|coverage|\.next|\.turbo|\.vitest-reports)\//.test(
        file,
      ),
  },
  {
    id: 'generated-source',
    category: 'generated',
    reason:
      'Emitted from a schema, spec, or codegen step; the generator owns its correctness, not a unit test.',
    matches: (file) =>
      /(?:^|\/)(?:generated|__generated__)\//.test(file) ||
      /\.(?:gen|generated)\.[cm]?[jt]sx?$/.test(file),
  },
  {
    id: 'test-source',
    category: 'test',
    reason: 'Test files are the measurement instrument, not the measured code.',
    matches: (file) => /\.(?:test|spec|e2e-spec)\.[cm]?[jt]sx?$/.test(file),
  },
  {
    id: 'test-support',
    category: 'test',
    reason:
      'Fixtures, stubs, mocks, and suite helpers exist only to drive tests.',
    matches: (file) =>
      /(?:^|\/)(?:tests?|__tests__|__mocks__|__fixtures__|fixtures|mocks)\//.test(
        file,
      ) || /\.(?:stub|mock|fixture)\.[cm]?[jt]sx?$/.test(file),
  },
  {
    id: 'playwright-suite',
    category: 'test',
    reason:
      'The Playwright suite is an end-to-end instrument; its own coverage lives in the weekly Coverage workflow.',
    matches: (file) => /^playwright\//.test(file),
  },
  {
    id: 'tooling-config',
    category: 'config',
    reason:
      'Tool configuration is executed by the toolchain, never by an instrumented suite.',
    matches: (file) => TOOLING_CONFIG.test(file),
  },
  {
    id: 'server-uninstrumented',
    category: 'uninstrumented',
    reason:
      'Excluded from the API suite instrumentation itself (apps/server/api/vitest.config.ts coverage.exclude): DI modules, barrels, and bootstrap entrypoints.',
    matches: (file) =>
      /^apps\/server\//.test(file) &&
      (/\.module\.ts$/.test(file) ||
        /(?:^|\/)index\.[cm]?ts$/.test(file) ||
        /^apps\/server\/api\/src\/(?:main|instrument)\.ts$/.test(file)),
  },
  {
    id: 'repository-tooling',
    category: 'out-of-surface',
    reason:
      'Repository scripts, CI helpers, and agent memory are not loaded by any instrumented product suite.',
    matches: (file) =>
      /^(?:scripts|tools|configs|\.github|\.agents)\//.test(file),
  },
];

/**
 * Classify one repository-relative POSIX path against the policy.
 *
 * @param {string} file
 * @returns {{file: string, included: boolean, ruleId: string|null, category: string|null, reason: string|null}}
 */
export function classifyChangedFile(file) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new TypeError('file must be a non-empty repository-relative path');
  }

  const normalized = normalizeRepositoryPath(file);

  for (const rule of CHANGED_CODE_COVERAGE_EXCLUSIONS) {
    if (rule.matches(normalized)) {
      return {
        file: normalized,
        included: false,
        ruleId: rule.id,
        category: rule.category,
        reason: rule.reason,
      };
    }
  }

  return {
    file: normalized,
    included: true,
    ruleId: null,
    category: null,
    reason: null,
  };
}

/**
 * Split changed paths into the measured set and the reasoned exclusion list.
 *
 * @param {readonly string[]} files
 */
export function partitionChangedFiles(files) {
  const included = [];
  const excluded = [];

  for (const file of files) {
    const classification = classifyChangedFile(file);
    if (classification.included) {
      included.push(classification.file);
    } else {
      excluded.push({
        file: classification.file,
        ruleId: classification.ruleId,
        category: classification.category,
        reason: classification.reason,
      });
    }
  }

  included.sort();
  excluded.sort((left, right) => left.file.localeCompare(right.file));

  return { included, excluded };
}

export function normalizeRepositoryPath(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}
