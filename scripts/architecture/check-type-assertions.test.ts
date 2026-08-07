import { describe, expect, it } from 'vitest';
import { stripCommentsAndStrings } from './check-type-assertions';

/**
 * The ratchet counts `as any` / `as never` with a line regex. Prose and string
 * data that merely spell them are not casts — a doc comment reading
 * "never `as never`" used to count as a violation and fail CI on a clean file.
 * These cases are the ones that actually shipped that failure.
 */
function code(line: string, inBlockComment = false): string {
  return stripCommentsAndStrings(line, inBlockComment).code;
}

function hasCast(line: string, inBlockComment = false): boolean {
  return /\bas (any|never)\b/.test(code(line, inBlockComment));
}

describe('stripCommentsAndStrings', () => {
  it('keeps a real cast', () => {
    expect(hasCast('  const x = value as never;')).toBe(true);
    expect(hasCast('  return payload as any;')).toBe(true);
  });

  it('ignores a cast spelled inside a line comment', () => {
    expect(hasCast('const x = 1; // avoid using value as never here')).toBe(
      false,
    );
  });

  it('ignores prose in a single-line block comment', () => {
    expect(
      hasCast('/** Returns undefined (never throws, never `as never`). */'),
    ).toBe(false);
  });

  it('ignores English prose that merely reads "as any"', () => {
    // packages/libs/bootstrap/run-service.ts shipped exactly this line.
    expect(hasCast(' * as any service that surfaces the raw string.')).toBe(
      false,
    );
  });

  it('ignores a cast inside a string literal', () => {
    expect(hasCast('const msg = "do not write as never";')).toBe(false);
    expect(hasCast("const msg = 'do not write as never';")).toBe(false);
    expect(hasCast('const msg = `do not write as never`;')).toBe(false);
  });

  it('carries block-comment state across lines', () => {
    const open = stripCommentsAndStrings('/* start', false);
    expect(open.inBlockComment).toBe(true);

    const middle = stripCommentsAndStrings(
      ' * service = new S(mock as never);',
      open.inBlockComment,
    );
    expect(middle.inBlockComment).toBe(true);
    expect(/\bas never\b/.test(middle.code)).toBe(false);

    const close = stripCommentsAndStrings(' */ const x = y as never;', true);
    expect(close.inBlockComment).toBe(false);
    expect(/\bas never\b/.test(close.code)).toBe(true);
  });

  it('does not swallow code after a URL in a string', () => {
    // A naive `//` split would drop the cast and under-count the ratchet.
    expect(hasCast(`const u = 'https://x.test' as never;`)).toBe(true);
  });

  it('ends a string at an escaped-backslash terminator', () => {
    expect(hasCast("const sep = '\\\\'; const x = y as never;")).toBe(true);
  });

  it('preserves column positions so reported offsets stay usable', () => {
    const line = 'const x = /* note */ value as never;';
    expect(code(line)).toHaveLength(line.length);
  });
});
