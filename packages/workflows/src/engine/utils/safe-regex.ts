import type { checkSync as CheckSync } from 'recheck';

/**
 * Maximum character length allowed for a user-supplied regex pattern.
 *
 * Patterns longer than this are rejected before any analysis or compilation
 * attempt. Combined with {@link SAFE_SUBJECT_MAX_LENGTH} this provides
 * defense-in-depth against ReDoS and bounds the cost of the static analysis
 * itself.
 *
 * Issue: genfeedai/genfeed.ai#475 (ReDoS-proof regex evaluation)
 */
export const SAFE_PATTERN_MAX_LENGTH = 200;

/**
 * Maximum character length of a subject string passed to a safe regex test.
 *
 * Subjects are sliced to this length before calling `RegExp.prototype.test`.
 * Together with the degree-2 polynomial cap enforced by
 * {@link createSafeRegExp}, this bounds the worst-case match cost to roughly
 * `SAFE_SUBJECT_MAX_LENGTH ** 2` elementary steps (~150ms measured), so a
 * permitted pattern can never block the event loop for an unbounded time.
 *
 * Issue: genfeedai/genfeed.ai#475 (ReDoS-proof regex evaluation)
 */
export const SAFE_SUBJECT_MAX_LENGTH = 10_000;

/**
 * Highest polynomial backtracking degree a pattern may have and still be
 * accepted. Degree 2 (quadratic) is allowed because virtually every practical
 * pattern that begins with an unbounded quantifier (e.g. `\d+ features`,
 * email-like patterns) is classified as degree 2 by the analyzer — the regex
 * engine re-scans from each start position — and the subject-length cap keeps
 * quadratic cost bounded. Degree >= 3 and exponential patterns are rejected.
 */
const SAFE_MAX_POLYNOMIAL_DEGREE = 2;

/**
 * Per-pattern analysis budget in milliseconds for the `recheck` automaton
 * checker. CI runners have shown the common quadratic `\d+ features` case can
 * exceed 500ms during cold analyzer startup, so this budget leaves enough room
 * for supported degree-2 patterns while still rejecting unknown/timeout cases.
 * Verdicts are cached, so this cost is paid once per unique pattern + flags
 * combination.
 */
const ANALYSIS_TIMEOUT_MS = 1_500;

/**
 * Upper bound on cached safety verdicts. Patterns come from user-authored
 * workflow configs, so the working set is small; the cap only guards against
 * unbounded growth. Eviction is FIFO (oldest insertion first).
 */
const VERDICT_CACHE_MAX_ENTRIES = 1_000;

const verdictCache = new Map<string, boolean>();

/**
 * The analyzer is a 2.8 MB Scala.js bundle that holds about 9 MB of live heap
 * once loaded, and only workflows that match a user-written regex use it. It
 * is loaded on the first analysis instead of at startup, so every process that
 * imports this file does not pay for it. `createSafeRegExp` is synchronous,
 * which is why this is a lazy `require` and not a dynamic `import()`.
 */
let checkSyncImpl: typeof CheckSync | undefined;

function loadCheckSync(): typeof CheckSync {
  checkSyncImpl ??= (require('recheck') as { checkSync: typeof CheckSync })
    .checkSync;
  return checkSyncImpl;
}

/**
 * Runs `recheck`'s automaton-based ReDoS analysis on a pattern and caches the
 * verdict. A pattern is considered safe when the analyzer proves it is safe,
 * or when its worst-case backtracking is polynomial of degree
 * <= {@link SAFE_MAX_POLYNOMIAL_DEGREE}. Exponential patterns, polynomial
 * patterns of degree >= 3, syntactically invalid patterns, and patterns whose
 * analysis times out (status `unknown`) are all rejected.
 */
function isPatternSafe(pattern: string, flags: string): boolean {
  const cacheKey = `${flags}::${pattern}`;
  const cachedVerdict = verdictCache.get(cacheKey);
  if (cachedVerdict !== undefined) {
    return cachedVerdict;
  }

  let isSafe: boolean;
  try {
    const diagnostics = loadCheckSync()(pattern, flags, {
      checker: 'automaton',
      timeout: ANALYSIS_TIMEOUT_MS,
    });
    isSafe =
      diagnostics.status === 'safe' ||
      (diagnostics.status === 'vulnerable' &&
        diagnostics.complexity.type === 'polynomial' &&
        diagnostics.complexity.degree <= SAFE_MAX_POLYNOMIAL_DEGREE);
  } catch {
    isSafe = false;
  }

  if (verdictCache.size >= VERDICT_CACHE_MAX_ENTRIES) {
    const oldestKey = verdictCache.keys().next().value;
    if (oldestKey !== undefined) {
      verdictCache.delete(oldestKey);
    }
  }
  verdictCache.set(cacheKey, isSafe);

  return isSafe;
}

/**
 * Compiles a user-supplied pattern into a `RegExp` after validating it is
 * statically safe against ReDoS.
 *
 * Returns `null` when any of the following hold:
 * - `pattern.length > SAFE_PATTERN_MAX_LENGTH` (length cap)
 * - `recheck` automaton analysis classifies the pattern as exponential
 *   (e.g. `(a+)+b`) or polynomial of degree >= 3 (e.g. `.*.*Z`, or the
 *   25x `.*` chain that defeats quantifier-counting checkers)
 * - analysis returns `unknown` (invalid syntax, unsupported construct, or
 *   analysis timeout)
 * - `new RegExp(pattern, flags)` throws a `SyntaxError`
 *
 * A fresh `RegExp` instance is returned on every call, so stateful flags
 * (`g`, `y`) never leak `lastIndex` across call sites even though safety
 * verdicts are cached internally.
 *
 * Callers that receive `null` should fall back to a safe string-based
 * operation (e.g. `String.prototype.includes`) rather than propagating the
 * failure to the user as an error.
 *
 * @param pattern - The user-supplied regex source string (no surrounding `/`).
 * @param flags   - Optional flags string (e.g. `'i'`, `'gi'`). Defaults to `''`.
 * @returns A compiled `RegExp`, or `null` if the pattern is unsafe/invalid.
 *
 * @example
 * // Safe pattern — returns RegExp
 * createSafeRegExp('\\d+', 'i'); // => /\d+/i
 *
 * // Exponential backtracking — returns null
 * createSafeRegExp('(a+)+b'); // => null
 *
 * // High-degree polynomial backtracking — returns null
 * createSafeRegExp('.*.*.*Z'); // => null
 *
 * // Pattern exceeding length cap — returns null
 * createSafeRegExp('a'.repeat(201)); // => null
 *
 * // Invalid syntax — returns null
 * createSafeRegExp('[unclosed'); // => null
 */
export function createSafeRegExp(
  pattern: string,
  flags: string = '',
): RegExp | null {
  if (pattern.length > SAFE_PATTERN_MAX_LENGTH) {
    return null;
  }

  if (!isPatternSafe(pattern, flags)) {
    return null;
  }

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}
