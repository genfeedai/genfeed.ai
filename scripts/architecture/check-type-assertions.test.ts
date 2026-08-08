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

function interpolation(expression: string): string {
  return `\${${expression}}`;
}

function templateLiteral(text: string): string {
  return `\`${text}\``;
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
    expect(
      hasCast(' * as any service that surfaces the raw string.', true),
    ).toBe(false);
  });

  it('ignores a cast inside a string literal', () => {
    expect(hasCast('const msg = "do not write as never";')).toBe(false);
    expect(hasCast("const msg = 'do not write as never';")).toBe(false);
    expect(hasCast('const msg = `do not write as never`;')).toBe(false);
  });

  it('keeps a cast inside a template-literal interpolation', () => {
    expect(
      hasCast(`const msg = ${templateLiteral(interpolation('value as any'))};`),
    ).toBe(true);
  });

  it('keeps a cast inside a nested template-literal interpolation', () => {
    const nested = templateLiteral(
      `plain as any ${interpolation('value as never')}`,
    );
    const stripped = code(
      `const msg = ${templateLiteral(
        interpolation(`condition ? ${nested} : ''`),
      )};`,
    );

    expect(stripped).not.toMatch(/\bas any\b/);
    expect(stripped).toMatch(/\bas never\b/);
  });

  it('keeps a cast after balanced braces inside an interpolation', () => {
    expect(
      hasCast(
        `const msg = ${templateLiteral(
          interpolation('{ value: input }.value as never'),
        )};`,
      ),
    ).toBe(true);
  });

  it('does not treat an escaped interpolation opener as code', () => {
    expect(
      hasCast(
        `const msg = ${templateLiteral(`\\${interpolation('value as any')}`)};`,
      ),
    ).toBe(false);
  });

  it('does not end a template at an escaped backtick', () => {
    const stripped = code(
      `const msg = ${templateLiteral(
        `escaped \\${'`'} plain as any ${interpolation('value as never')}`,
      )};`,
    );

    expect(stripped).not.toMatch(/\bas any\b/);
    expect(stripped).toMatch(/\bas never\b/);
  });

  it('ignores cast words in plain template text', () => {
    expect(
      hasCast(
        `const msg = ${templateLiteral('do not write as any or as never')};`,
      ),
    ).toBe(false);
  });

  it('carries template state across lines', () => {
    const open = stripCommentsAndStrings('const msg = `plain as any', false);
    expect(/\bas any\b/.test(open.code)).toBe(false);

    const middle = stripCommentsAndStrings(
      `still plain as any ${interpolation('value as never')}`,
      open.inBlockComment,
      open.templateStack,
    );
    expect(/\bas any\b/.test(middle.code)).toBe(false);
    expect(/\bas never\b/.test(middle.code)).toBe(true);

    const close = stripCommentsAndStrings(
      'plain as any`;',
      middle.inBlockComment,
      middle.templateStack,
    );
    expect(/\bas any\b/.test(close.code)).toBe(false);
    expect(close.templateStack).toEqual([]);
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
