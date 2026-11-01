/** Longest span, in words, that still reads as a style choice and not a rewrite. */
const MAX_SPAN_WORDS = 6;
/** Posts longer than this many words are not diffed; the cost grows with both texts. */
const MAX_DIFF_WORDS = 400;
export const MAX_RULE_PROPOSALS = 3;
export const MAX_BRAND_RULE_LENGTH = 200;

const FILLER_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'so',
  'the',
  'to',
]);

interface WordToken {
  /** Lowercased with edge punctuation removed; what two words are compared by. */
  key: string;
  /** The word as written, edge punctuation removed. */
  text: string;
}

interface DiffHunk {
  added: WordToken[];
  removed: WordToken[];
}

export interface BrandRuleProposalInput {
  /** The generated text the user started from. */
  original?: string;
  /** The text after the user's edit. */
  edited?: string;
  /** Why the user rejected the draft, in their words. */
  reason?: string;
}

function tokenize(text: string): WordToken[] {
  return text.split(/\s+/u).flatMap((word) => {
    const stripped = word.replace(/^[^\p{L}\p{N}@#]+|[^\p{L}\p{N}]+$/gu, '');
    return stripped ? [{ key: stripped.toLowerCase(), text: stripped }] : [];
  });
}

/** A stretch the two texts share, or a hunk where the edit replaced or removed words. */
type DiffSegment = { common: WordToken[] } | { hunk: DiffHunk };

/** Walks the longest common subsequence of both texts into shared stretches and hunks. */
function diffWords(
  before: readonly WordToken[],
  after: readonly WordToken[],
): DiffSegment[] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lengths = Array.from({ length: rows }, () =>
    new Array<number>(columns).fill(0),
  );
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      lengths[row][column] =
        before[row].key === after[column].key
          ? lengths[row + 1][column + 1] + 1
          : Math.max(lengths[row + 1][column], lengths[row][column + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let hunk: DiffHunk = { added: [], removed: [] };
  const closeHunk = () => {
    if (hunk.removed.length > 0 || hunk.added.length > 0) {
      segments.push({ hunk });
      hunk = { added: [], removed: [] };
    }
  };
  const addCommon = (token: WordToken) => {
    closeHunk();
    const last = segments[segments.length - 1];
    if (last && 'common' in last) last.common.push(token);
    else segments.push({ common: [token] });
  };
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row].key === after[column].key) {
      addCommon(before[row]);
      row += 1;
      column += 1;
    } else if (lengths[row + 1][column] >= lengths[row][column + 1]) {
      hunk.removed.push(before[row]);
      row += 1;
    } else {
      hunk.added.push(after[column]);
      column += 1;
    }
  }
  hunk.removed.push(...before.slice(row));
  hunk.added.push(...after.slice(column));
  closeHunk();
  return segments;
}

/**
 * One replaced phrase is often aligned as two replacements around a shared
 * word ("Check it out below" -> "Try it today" shares "it"). Two replacements
 * that sit one shared word apart are read as the one phrase they are.
 */
function toHunks(segments: readonly DiffSegment[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!('hunk' in segment)) continue;
    const previous = hunks[hunks.length - 1];
    const gap = segments[index - 1];
    const isPhrase =
      previous !== undefined &&
      gap !== undefined &&
      'common' in gap &&
      gap.common.length === 1 &&
      previous.removed.length > 0 &&
      previous.added.length > 0 &&
      segment.hunk.removed.length > 0 &&
      segment.hunk.added.length > 0;
    if (isPhrase) {
      previous.removed.push(...gap.common, ...segment.hunk.removed);
      previous.added.push(...gap.common, ...segment.hunk.added);
    } else {
      hunks.push({
        added: [...segment.hunk.added],
        removed: [...segment.hunk.removed],
      });
    }
  }
  return hunks;
}

/**
 * Names, numbers and links change because the facts changed, not because the
 * brand prefers other wording, so they never become a rule.
 */
function isStyleSpan(words: readonly WordToken[]): boolean {
  if (words.length === 0 || words.length > MAX_SPAN_WORDS) return false;
  if (words.every((word) => FILLER_WORDS.has(word.key))) return false;
  return words.every((word) => !/[\p{N}@#]/u.test(word.text));
}

function quote(words: readonly WordToken[]): string {
  return `"${words.map((word) => word.text).join(' ')}"`;
}

function toRule(hunk: DiffHunk): string | null {
  if (!isStyleSpan(hunk.removed)) return null;
  if (hunk.added.length === 0) return `Never use ${quote(hunk.removed)}.`;
  if (!isStyleSpan(hunk.added)) return null;
  return `Prefer ${quote(hunk.added)} over ${quote(hunk.removed)}.`;
}

/** The reason a user gave for rejecting a draft, as a rule when it is short enough to be one. */
function ruleFromReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim().replace(/\s+/gu, ' ') ?? '';
  if (trimmed.length < 3 || trimmed.length > MAX_BRAND_RULE_LENGTH) return null;
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Turns a correction into short brand rules for the user to accept or dismiss:
 * words they cut become "Never use X", words they swapped become "Prefer Y over
 * X", and a rejection reason becomes a rule as written. Pure and deterministic;
 * nothing here saves anything.
 */
export function deriveBrandRuleProposals(
  input: BrandRuleProposalInput,
): string[] {
  const fromEdit = (() => {
    const before = tokenize(input.original ?? '');
    const after = tokenize(input.edited ?? '');
    if (
      before.length === 0 ||
      before.length > MAX_DIFF_WORDS ||
      after.length > MAX_DIFF_WORDS
    ) {
      return [];
    }
    return toHunks(diffWords(before, after)).flatMap((hunk) => {
      const rule = toRule(hunk);
      return rule ? [rule] : [];
    });
  })();
  const reasonRule = ruleFromReason(input.reason);
  return Array.from(
    new Set([...(reasonRule ? [reasonRule] : []), ...fromEdit]),
  ).slice(0, MAX_RULE_PROPOSALS);
}

/** Case- and punctuation-insensitive identity, so "Never use X." and "never use x" count as one rule. */
export function normalizeBrandRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
