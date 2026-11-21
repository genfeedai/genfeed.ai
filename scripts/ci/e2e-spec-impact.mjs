#!/usr/bin/env node

/**
 * Same-PR rule for Playwright specs.
 *
 * A pull request that removes or rewrites a string the browser specs assert
 * (UI copy, preset ids, fixture values) must update those specs in the same
 * pull request. Playwright Full is too slow to run per PR, so the stale spec
 * only surfaced on master. This check is the cheap stand-in: it reads the diff
 * and the spec sources, runs no browser, and costs seconds inside Static Checks.
 *
 * For each changed app or package source file it collects the string literals
 * and JSX text that the PR removed (and did not re-add in the same file), then
 * looks for them in `playwright/`. A hit in a spec, page object or fixture that
 * fails the check, touched by the PR or not: a touched spec can keep the line
 * that broke.
 *
 * Three shapes the plain phrase match misses, each replayed from a real miss in
 * the tests (#10333 broke specs fixed by #10362 and #10376 on master):
 * - A message with a placeholder (`Resize to {format}`): the fixed text around
 *   the placeholder is matched, because a spec asserts the rendered string.
 * - A label shortened to text a spec already used as a loose locator
 *   (`Skip for now` became `Skip`, and `getByRole('button', { name: 'Skip' })`
 *   without `exact` now also matches `Skip onboarding`).
 * - A removed glyph (`'⏳'`): the spec builds its text around it.
 *
 * Opt out when the match is a false positive: add a commit trailer
 * `E2E-Spec-Impact: none - <reason>` to any commit in the PR.
 *
 *   node scripts/ci/e2e-spec-impact.mjs --base <sha> [--head <ref>]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMMAND_MAX_BUFFER = 100 * 1024 * 1024;
const MAX_REPORTED_FINDINGS = 40;

const SOURCE_PATH_PATTERN =
  /^(?:apps\/web|packages)\/.+\.(?:tsx?|jsx?|mjs|json)$/;
const NON_SHIPPED_PATH_PATTERN =
  /(?:\.(?:spec|test|stories)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|__mocks__|__fixtures__|fixtures|tests?|node_modules|dist|\.next)\/|(?:^|\/)(?:package|tsconfig[^/]*|components)\.json$|\.d\.ts$)/;
const E2E_ROOT = 'playwright/';
const E2E_FILE_PATTERN = /^playwright\/.+\.(?:tsx?|mjs|json)$/;
const OPT_OUT_PATTERN = /^E2E-Spec-Impact:\s*none\b\s*[-:–—]?\s*\S/im;

const QUOTED_LITERAL_PATTERN = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const JSX_INLINE_TEXT_PATTERN = />([^<>{}=]*[A-Za-z][^<>{}=]*)</g;
const JSX_BARE_TEXT_PATTERN = /^[A-Z][A-Za-z0-9 ,.'’!?:&()/-]{4,}$/;
const IMPORT_LINE_PATTERN =
  /^\s*(?:import\b|export\b[^=]*\bfrom\b|\/\/|\*|\/\*)/;
// Kebab or snake case ids (test ids, preset ids). Plain words are too common.
const ID_TOKEN_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/;
const CLASS_TOKEN_PATTERN = /^[!a-z0-9:[\]\-/._%()#,]+$/;
const WHITESPACE_PATTERN = /\s+/g;
const INTERPOLATION_PATTERN = /\$\{/;
const ESCAPED_QUOTE_PATTERN = /\\(['"`])/g;
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;
// ICU message placeholders (`{format}`, `{count, plural, ...}`), not `${...}`.
const ICU_PLACEHOLDER_PATTERN = /(?<!\$)\{[A-Za-z_][\w]*(?:,[^{}]*)?\}/;
const ICU_PLACEHOLDER_SPLIT_PATTERN = /(?<!\$)\{[A-Za-z_][\w]*(?:,[^{}]*)?\}/g;
// One emoji or pictograph, with an optional variation selector.
const GLYPH_PATTERN = /^\p{Extended_Pictographic}\uFE0F?$/u;
// Locator arguments a spec uses to find visible text.
const LOCATOR_STRING_PATTERN =
  /(?:\bgetBy(?:Text|Label|Placeholder|Title|AltText)\(\s*|\bname:\s*)(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const EXACT_OPTION_PATTERN = /\bexact:\s*true\b/;
const LETTER_PATTERN = /[A-Za-z]/;
const OBJECT_KEY_SUFFIX_PATTERN = /^\s*:/;
const MIN_LOCATOR_LENGTH = 4;
const LOCATOR_CALL_LOOKBACK = 160;
const LOCATOR_CALL_LOOKAHEAD = 80;

const UTILITY_CLASS_PATTERN =
  /^(?:[a-z0-9]+:)*-?(?:flex|grid|inline|block|text|bg|border|ring|outline|divide|space|gap|size|shadow|rounded|opacity|object|overflow|items|justify|self|content|place|font|leading|tracking|whitespace|break|truncate|cursor|pointer|select|transition|duration|ease|animate|transform|translate|scale|rotate|origin|z|top|bottom|left|right|inset|col|row|order|basis|grow|shrink|aspect|line|list|underline|sr|min|max|w|h|p[xytblrse]?|m[xytblrse]?)-/;

const CODE_CHARACTER_PATTERN = /[(){};=<>[\]\\|]/;
const MIN_PHRASE_LENGTH = 8;
const MAX_LITERAL_LENGTH = 160;
const MIN_TOKEN_LENGTH = 8;

function normalizeSpace(text) {
  return text.replace(WHITESPACE_PATTERN, ' ').trim();
}

function isClassList(text) {
  const tokens = text.split(' ');
  return (
    tokens.length > 1 &&
    tokens.every((token) => CLASS_TOKEN_PATTERN.test(token)) &&
    tokens.some((token) => /[-:[]/.test(token))
  );
}

/**
 * Classify a literal as something a spec can assert.
 * `phrase`: visible copy with a space, matched anywhere in a spec.
 * `token`: a kebab or snake case id (preset id, test id), matched
 * only when the spec quotes it exactly.
 * `glyph`: one emoji, matched anywhere in a spec (specs build text around it).
 */
export function classifyLiteral(raw) {
  const text = normalizeSpace(raw.replace(ESCAPED_QUOTE_PATTERN, '$1'));
  if (GLYPH_PATTERN.test(text)) return { kind: 'glyph', text };
  if (
    text.length < MIN_PHRASE_LENGTH ||
    text.length > MAX_LITERAL_LENGTH ||
    !LETTER_PATTERN.test(text) ||
    INTERPOLATION_PATTERN.test(text) ||
    CODE_CHARACTER_PATTERN.test(text)
  ) {
    return null;
  }
  if (text.includes(' ')) {
    return isClassList(text) ? null : { kind: 'phrase', text };
  }
  if (
    text.length >= MIN_TOKEN_LENGTH &&
    ID_TOKEN_PATTERN.test(text) &&
    !UTILITY_CLASS_PATTERN.test(text)
  ) {
    return { kind: 'token', text };
  }
  return null;
}

/**
 * Classify a raw literal, splitting a message with placeholders into the fixed
 * text around them: a spec asserts the rendered `Resize to Square`, never the
 * `Resize to {format}` template, so the template itself would never match.
 */
export function classifyLiterals(raw) {
  if (!ICU_PLACEHOLDER_PATTERN.test(raw)) {
    const literal = classifyLiteral(raw);
    return literal ? [literal] : [];
  }
  return raw
    .split(ICU_PLACEHOLDER_SPLIT_PATTERN)
    .map(classifyLiteral)
    .filter((literal) => literal?.kind === 'phrase');
}

/** Short visible labels on one line (`Skip`), too short to be a phrase. */
export function extractLabels(line) {
  if (IMPORT_LINE_PATTERN.test(line)) return [];
  const found = [];
  for (const match of line.matchAll(QUOTED_LITERAL_PATTERN)) {
    // `"agent": "Connect Agent"`: the key is not visible text.
    const isObjectKey = OBJECT_KEY_SUFFIX_PATTERN.test(
      line.slice(match.index + match[0].length),
    );
    if (!isObjectKey) found.push(match[2]);
  }
  for (const match of line.matchAll(JSX_INLINE_TEXT_PATTERN)) {
    found.push(match[1]);
  }
  return found
    .map((raw) => normalizeSpace(raw.replace(ESCAPED_QUOTE_PATTERN, '$1')))
    .filter(
      (text) =>
        text.length >= MIN_LOCATOR_LENGTH &&
        text.length <= MAX_LITERAL_LENGTH &&
        LETTER_PATTERN.test(text) &&
        !INTERPOLATION_PATTERN.test(text) &&
        !CODE_CHARACTER_PATTERN.test(text),
    );
}

/** Candidate literals on one source line. */
export function extractLiterals(line) {
  if (IMPORT_LINE_PATTERN.test(line)) return [];
  const found = [];
  for (const match of line.matchAll(QUOTED_LITERAL_PATTERN)) {
    found.push(match[2]);
  }
  for (const match of line.matchAll(JSX_INLINE_TEXT_PATTERN)) {
    found.push(match[1]);
  }
  const trimmed = line.trim();
  if (JSX_BARE_TEXT_PATTERN.test(trimmed) && trimmed.includes(' ')) {
    found.push(trimmed);
  }
  return found.flatMap(classifyLiterals);
}

export function isShippedSource(file) {
  return SOURCE_PATH_PATTERN.test(file) && !NON_SHIPPED_PATH_PATTERN.test(file);
}

function containsWholeWords(phrase, label) {
  const escaped = label.replace(REGEX_ESCAPE_PATTERN, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, 'i').test(
    phrase,
  );
}

/**
 * A removed phrase and the shorter label that replaced it on the same line
 * (`Skip for now` -> `Skip`). A spec that used the short text as a loose
 * locator matched the long label; it now matches any label containing the
 * short text. Lines pair by position inside one run of removed then added
 * lines, so an unrelated short label elsewhere in the file never counts.
 */
function recordShortenings(shortened, removedLines, addedLines) {
  if (removedLines.length !== addedLines.length) return;
  removedLines.forEach((removed, index) => {
    for (const literal of removed) {
      if (literal.kind !== 'phrase') continue;
      for (const label of addedLines[index]) {
        if (
          label.length < literal.text.length &&
          containsWholeWords(literal.text, label)
        ) {
          const key = `phrase:${literal.text}`;
          shortened.set(key, [...(shortened.get(key) ?? []), label]);
        }
      }
    }
  });
}

/**
 * Literals removed per source file: on a removed line, absent from every added
 * line of the same file. A reflowed or moved line is not a change.
 */
export function removedLiteralsByFile(diffText) {
  const perFile = new Map();
  let current = null;
  let isHeader = false;
  let run = { added: [], removed: [] };
  const flushRun = () => {
    const bucket = current ? perFile.get(current) : null;
    if (bucket) recordShortenings(bucket.shortened, run.removed, run.added);
    run = { added: [], removed: [] };
  };
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flushRun();
      isHeader = true;
      current = null;
      continue;
    }
    if (line.startsWith('@@')) {
      flushRun();
      isHeader = false;
      continue;
    }
    if (isHeader) {
      if (line.startsWith('--- ')) {
        const source = line.slice(4);
        current = source === '/dev/null' ? null : source.replace(/^a\//, '');
      } else if (line.startsWith('+++ ')) {
        const target = line.slice(4);
        if (target !== '/dev/null') current = target.replace(/^b\//, '');
      }
      continue;
    }
    if (!current || !isShippedSource(current)) continue;
    const bucket =
      perFile.get(current) ??
      perFile
        .set(current, {
          added: new Set(),
          removed: new Map(),
          shortened: new Map(),
        })
        .get(current);
    if (line.startsWith('+')) {
      const literals = extractLiterals(line.slice(1));
      for (const literal of literals) {
        bucket.added.add(`${literal.kind}:${literal.text}`);
      }
      run.added.push(extractLabels(line.slice(1)));
    } else if (line.startsWith('-')) {
      if (run.added.length > 0) flushRun();
      const literals = extractLiterals(line.slice(1));
      for (const literal of literals) {
        bucket.removed.set(`${literal.kind}:${literal.text}`, literal);
      }
      run.removed.push(literals);
    }
  }
  flushRun();
  const result = new Map();
  for (const [file, { added, removed, shortened }] of perFile) {
    const gone = [...removed]
      .filter(([key]) => !added.has(key))
      .map(([key, literal]) =>
        shortened.has(key)
          ? { ...literal, shortenedTo: [...new Set(shortened.get(key))] }
          : literal,
      );
    if (gone.length > 0) result.set(file, gone);
  }
  return result;
}

function tokenPattern(text) {
  const escaped = text.replace(REGEX_ESCAPE_PATTERN, '\\$&');
  return new RegExp(`(['"\`])${escaped}\\1`);
}

/** Strings a spec passes to a text locator without `exact: true`. */
export function looseLocatorStrings(content) {
  const found = new Set();
  for (const match of content.matchAll(LOCATOR_STRING_PATTERN)) {
    const text = normalizeSpace(match[2]).toLowerCase();
    if (text.length < MIN_LOCATOR_LENGTH || INTERPOLATION_PATTERN.test(text)) {
      continue;
    }
    const end = match.index + match[0].length;
    const lookback = content.slice(
      Math.max(0, match.index - LOCATOR_CALL_LOOKBACK),
      match.index + match[0].length,
    );
    const lastLocator = lookback.lastIndexOf('getBy');
    const callStart = lastLocator === -1 ? 0 : lastLocator;
    const lookahead = content.slice(end, end + LOCATOR_CALL_LOOKAHEAD);
    const closing = lookahead.indexOf(')');
    const call =
      lookback.slice(callStart) +
      (closing === -1 ? lookahead : lookahead.slice(0, closing));
    if (!EXACT_OPTION_PATTERN.test(call)) found.add(text);
  }
  return found;
}

function isPresentIn(spec, literal, matcher, needle) {
  if (literal.kind === 'token') return matcher.test(spec.content);
  if (literal.kind === 'glyph') return spec.content.includes(literal.text);
  return spec.normalized.includes(needle);
}

/**
 * Spec files that still reference a removed literal. A spec the PR touched is
 * checked too: #10333 edited onboarding.spec.ts and playground-video-actions
 * and left the very lines that broke, so touching a file proves nothing about
 * the line. `specs` carry the text as it stands after the PR.
 */
export function findStaleReferences({ removed, specs }) {
  const looseLocators = new Map();
  const findings = [];
  for (const [sourceFile, literals] of removed) {
    for (const literal of literals) {
      const matcher =
        literal.kind === 'token' ? tokenPattern(literal.text) : null;
      const needle = literal.text.toLowerCase();
      for (const spec of specs) {
        if (isPresentIn(spec, literal, matcher, needle)) {
          findings.push({
            literal: literal.text,
            sourceFile,
            specFile: spec.file,
          });
          continue;
        }
        if (!literal.shortenedTo) continue;
        if (!looseLocators.has(spec.file)) {
          looseLocators.set(spec.file, looseLocatorStrings(spec.content));
        }
        const loose = literal.shortenedTo.find((label) =>
          looseLocators.get(spec.file).has(label.toLowerCase()),
        );
        if (loose) {
          findings.push({
            literal: literal.text,
            looseLocator: loose,
            sourceFile,
            specFile: spec.file,
          });
        }
      }
    }
  }
  return findings;
}

export function describeFinding(finding) {
  if (finding.looseLocator) {
    return `::error file=${finding.specFile}::"${finding.literal}" was shortened in ${finding.sourceFile}, and this spec finds "${finding.looseLocator}" without exact: true, so it now also matches every longer label that contains it. Add exact: true or assert the new label.`;
  }
  return `::error file=${finding.specFile}::"${finding.literal}" was removed or changed in ${finding.sourceFile}, but this spec still references it.`;
}

export function hasOptOut(commitMessages) {
  return OPT_OUT_PATTERN.test(commitMessages);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: COMMAND_MAX_BUFFER,
  });
}

const SHIPPED_SEARCH_PATHSPEC = [
  '--',
  'apps/web',
  'packages',
  ':(exclude,glob)**/*.spec.*',
  ':(exclude,glob)**/*.test.*',
  ':(exclude,glob)**/__tests__/**',
  ':(exclude,glob)**/__mocks__/**',
  ':(exclude,glob)**/tests/**',
  ':(exclude,glob)**/fixtures/**',
];

/** True when the text still ships in app or package sources after the PR. */
function isStillShipped(text) {
  try {
    execFileSync(
      'git',
      ['grep', '-q', '-F', '-e', text, ...SHIPPED_SEARCH_PATHSPEC],
      {
        cwd: REPOSITORY_ROOT,
        stdio: 'ignore',
      },
    );
    return true;
  } catch {
    return false;
  }
}

function loadSpecs() {
  return git(['ls-files', '-z', '--', E2E_ROOT])
    .split('\0')
    .filter((file) => E2E_FILE_PATTERN.test(file))
    .map((file) => {
      const content = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
      return {
        content,
        file,
        normalized: normalizeSpace(content).toLowerCase(),
      };
    });
}

function parseArgs(argv) {
  const args = { base: process.env.CI_BASE_SHA ?? '', head: 'HEAD' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base') args.base = argv[++index];
    else if (argv[index] === '--head') args.head = argv[++index];
  }
  return args;
}

function run() {
  const { base, head } = parseArgs(process.argv.slice(2));
  if (!base) {
    console.log('No base SHA (not a pull request); skipping e2e spec impact.');
    return 0;
  }

  const changedFiles = git([
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    base,
    head,
  ])
    .split('\0')
    .filter(Boolean);
  if (!changedFiles.some(isShippedSource)) {
    console.log('No shipped app or package source changed; nothing to check.');
    return 0;
  }

  const diff = git([
    'diff',
    '--no-renames',
    '-U0',
    '--no-color',
    base,
    head,
    '--',
    'apps/web',
    'packages',
  ]);
  const removed = removedLiteralsByFile(diff);
  const stillShipped = new Map();
  const findings = findStaleReferences({
    removed,
    specs: loadSpecs(),
  }).filter(({ literal }) => {
    if (!stillShipped.has(literal)) {
      stillShipped.set(literal, isStillShipped(literal));
    }
    return !stillShipped.get(literal);
  });
  if (findings.length === 0) {
    console.log('No removed UI string is still asserted by an e2e spec.');
    return 0;
  }

  const commitMessages = git(['log', '--format=%B', `${base}..${head}`]);
  if (hasOptOut(commitMessages)) {
    console.log(
      `${findings.length} possible stale e2e reference(s) ignored: a commit carries "E2E-Spec-Impact: none".`,
    );
    return 0;
  }

  for (const finding of findings.slice(0, MAX_REPORTED_FINDINGS)) {
    console.log(describeFinding(finding));
  }
  console.log(
    [
      '',
      `${findings.length} e2e spec reference(s) look stale (same-PR rule).`,
      'This PR removed or rewrote strings that Playwright specs still assert.',
      'Update the listed spec, page object or fixture in this PR.',
      'If a match is a false positive, add this trailer to a commit message:',
      '  E2E-Spec-Impact: none - <why the specs are unaffected>',
    ].join('\n'),
  );
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = run();
}
