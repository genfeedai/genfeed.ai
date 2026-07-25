import type { SecurityErrorFactory } from '@libs/security/path-security';

/**
 * Guards for caller-supplied values that become `spawn()` argv elements.
 *
 * `spawn(cmd, args)` without a shell is immune to `;`/`|`/backtick injection —
 * every element lands in `argv` verbatim. It is NOT immune to *argument*
 * injection: an element whose text begins with `-` is parsed by the child as a
 * flag, not as the value of the preceding flag. `--output_name` followed by
 * `--config_file` hands the trainer a second option instead of a filename.
 *
 * Numeric parameters are the same hazard by a different route. A request field
 * typed `number` in TypeScript is still whatever JSON the caller sent at
 * runtime, and `String(value)` faithfully forwards a string into argv.
 *
 * Path-shaped identifiers belong to `assertSafeSegment` in `./path-security`;
 * these two functions cover the non-path argv elements.
 */

/** Longest accepted free-text argument value. */
export const MAX_ARG_VALUE_LENGTH = 128;

/**
 * Free-text argv element: printable ASCII, no leading `-`, no control
 * characters, bounded length. Deliberately narrower than "any legal string" —
 * these values are trainer parameters, not prose.
 */
export const SAFE_ARG_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/**
 * Assert a caller-supplied string is safe to pass as an argv element.
 *
 * The leading-character rule is the point: it is what stops the value from
 * being re-read as a flag by the child process.
 */
export function assertSafeArgValue(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_ARG_VALUE_LENGTH ||
    !SAFE_ARG_VALUE_PATTERN.test(value)
  ) {
    throw createError(
      `${name} must be at most ${MAX_ARG_VALUE_LENGTH} characters of letters, digits, spaces, '.', '-' or '_', and may not start with '-'`,
    );
  }

  return value;
}

export interface NumericBounds {
  max: number;
  min: number;
}

/**
 * Assert a caller-supplied value is a finite number inside `bounds`.
 *
 * Rejects strings outright rather than coercing them: `Number('1e999')` is
 * `Infinity` and `Number('')` is `0`, so coercion would quietly accept input
 * the caller never meant as a number.
 */
export function assertBoundedNumber(
  value: unknown,
  name: string,
  bounds: NumericBounds,
  createError: SecurityErrorFactory,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < bounds.min ||
    value > bounds.max
  ) {
    throw createError(
      `${name} must be a number between ${bounds.min} and ${bounds.max}`,
    );
  }

  return value;
}

/** Integer-only variant of {@link assertBoundedNumber}. */
export function assertBoundedInteger(
  value: unknown,
  name: string,
  bounds: NumericBounds,
  createError: SecurityErrorFactory,
): number {
  if (!Number.isInteger(value)) {
    throw createError(
      `${name} must be an integer between ${bounds.min} and ${bounds.max}`,
    );
  }

  return assertBoundedNumber(value, name, bounds, createError);
}
