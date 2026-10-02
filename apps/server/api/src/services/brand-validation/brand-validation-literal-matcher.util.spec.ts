import { matchBrandLiteralBlocks } from '@api/services/brand-validation/brand-validation-literal-matcher.util';
import { describe, expect, it, vi } from 'vitest';

const invalidMessage = 'brand_validation_invalid_literal_match_input';
function expectInvalid(operation: () => unknown): void {
  let failure: unknown;
  try {
    operation();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(TypeError);
  expect(failure instanceof Error && failure.constructor).toBe(TypeError);
  expect(failure instanceof Error && failure.message).toBe(invalidMessage);
}
function oracle(
  text: string,
  literals: readonly string[],
):
  | number[]
  | 'factual_coverage_unverified'
  | 'factual_coverage_ambiguous'
  | 'no_visible_text' {
  const actual = text.replaceAll('\r\n', '\n').normalize('NFC').trim();
  const prepared = literals.map((literal) =>
    literal.replaceAll('\r\n', '\n').normalize('NFC').trim(),
  );
  if (!actual) return 'no_visible_text';
  const paths: number[][] = [];
  function enumerate(position: number, path: number[]): void {
    if (paths.length >= 2) return;
    for (let index = 0; index < prepared.length; index++) {
      if (!actual.startsWith(prepared[index], position)) continue;
      const end = position + prepared[index].length;
      const next = [...path, index];
      if (end === actual.length) {
        paths.push(next);
        if (paths.length >= 2) return;
        continue;
      }
      if (actual[end] !== '\n') continue;
      let cursor = end;
      let lineFeeds = 0;
      while (
        cursor < actual.length &&
        ['\n', ' ', '\t'].includes(actual[cursor])
      ) {
        if (actual[cursor] === '\n') lineFeeds++;
        cursor++;
      }
      if (lineFeeds >= 2 && cursor < actual.length) enumerate(cursor, next);
      if (paths.length >= 2) return;
    }
  }
  enumerate(0, []);
  return paths.length === 0
    ? 'factual_coverage_unverified'
    : paths.length === 2
      ? 'factual_coverage_ambiguous'
      : paths[0];
}

describe('unique literal block segmentation', () => {
  it('returns the original index for a whole literal', () => {
    expect(matchBrandLiteralBlocks('hello', ['hello'])).toEqual([0]);
  });
  it.each([
    ['hello', ['other']],
    ['hello', []],
  ] as const)('leaves unmatched nonempty text unverified', (text, literals) => {
    expect(matchBrandLiteralBlocks(text, literals)).toBe(
      'factual_coverage_unverified',
    );
  });
  it.each(['', ' \r\n\t\u00a0\ufeff'])('reports no visible text', (text) => {
    expect(matchBrandLiteralBlocks(text, ['A'])).toBe('no_visible_text');
  });
  it('preserves index order and repeated use of one index', () => {
    expect(matchBrandLiteralBlocks('A\n\nB', ['B', 'A'])).toEqual([1, 0]);
    expect(matchBrandLiteralBlocks('A\n\nA', ['A'])).toEqual([0, 0]);
  });
  it.each(['A\nB', 'A B', 'AB', 'A.B', 'A \n\nB', 'A\n\u00a0\nB'])(
    'rejects unsupported joins in %s',
    (text) => {
      expect(matchBrandLiteralBlocks(text, ['A', 'B'])).toBe(
        'factual_coverage_unverified',
      );
    },
  );
  it('consumes indentation and outer-trims trailing LF in literals', () => {
    expect(matchBrandLiteralBlocks('A\n\nB', ['A', 'B'])).toEqual([0, 1]);
    expect(matchBrandLiteralBlocks('A\n\n\nB', ['A', 'B'])).toEqual([0, 1]);
    expect(matchBrandLiteralBlocks('A\n\t \n\t B', ['A', 'B'])).toEqual([0, 1]);
    expect(matchBrandLiteralBlocks('A\n\n\nB', ['A\n', 'B'])).toEqual([0, 1]);
    expect(matchBrandLiteralBlocks('A\n\n\nB', ['A\n\n', 'B'])).toEqual([0, 1]);
  });
  it('counts whole multiline and multiblock alternatives even when whole is first', () => {
    expect(matchBrandLiteralBlocks('A\n\nB', ['A\n\nB', 'A', 'B'])).toBe(
      'factual_coverage_ambiguous',
    );
  });
  it.each([
    ['A', ['A', 'A']],
    ['Café', ['Café', 'Cafe\u0301']],
  ] as const)('retains duplicate position alternatives', (text, literals) => {
    expect(matchBrandLiteralBlocks(text, literals)).toBe(
      'factual_coverage_ambiguous',
    );
  });
  it('normalizes CRLF/NFC and outer ECMAScript whitespace only', () => {
    expect(
      matchBrandLiteralBlocks(' \tCafe\u0301\r\n\r\nB\ufeff', [
        ' Café ',
        ' B ',
      ]),
    ).toEqual([0, 1]);
  });
  it.each([
    ['a  b', 'a b'],
    ['Hello', 'hello'],
    ['Hello!', 'Hello.'],
    ['Ａ', 'A'],
  ] as const)(
    'preserves internal/case/punctuation/compatibility differences',
    (text, literal) => {
      expect(matchBrandLiteralBlocks(text, [literal])).toBe(
        'factual_coverage_unverified',
      );
    },
  );
  it('accepts frozen arrays and returns fresh indices without input mutation', () => {
    const literals = Object.freeze(['B', 'A']);
    const first = matchBrandLiteralBlocks('A\n\nB', literals);
    expect(first).toEqual([1, 0]);
    if (Array.isArray(first)) first[0] = 99;
    expect(matchBrandLiteralBlocks('A\n\nB', literals)).toEqual([1, 0]);
    expect(literals).toEqual(['B', 'A']);
  });
  it('matches a bounded independent exhaustive oracle on 500 deterministic cases', () => {
    const separators = ['', ' ', '\n', '\n\n', '\n\t\n '];
    const catalogues = [
      ['A', 'B'],
      ['A', 'A', 'B'],
      ['A', 'A\n\nB', 'B'],
      ['AB', 'A', 'B'],
    ];
    let cases = 0;
    function tokens(length: number, prefix: string[]): void {
      if (cases >= 500) return;
      if (prefix.length < length) {
        for (const token of ['A', 'B']) tokens(length, [...prefix, token]);
        return;
      }
      function join(index: number, text: string): void {
        if (cases >= 500) return;
        if (index === prefix.length) {
          expect(text.length).toBeLessThanOrEqual(18);
          for (const catalogue of catalogues) {
            if (cases >= 500) return;
            expect(matchBrandLiteralBlocks(text, catalogue)).toEqual(
              oracle(text, catalogue),
            );
            cases++;
          }
          return;
        }
        for (const separator of separators)
          join(index + 1, `${text}${separator}${prefix[index]}`);
      }
      join(1, prefix[0]);
    }
    for (let length = 1; length <= 3; length++) tokens(length, []);
    expect(cases).toBe(500);
  });
});

describe('bounded inert input capture', () => {
  it('rejects primitive and boxed nonstring text without coercion', () => {
    // @ts-expect-error Intentional invalid primitive text.
    expectInvalid(() => matchBrandLiteralBlocks(1, ['A']));
    const boxed: unknown = Reflect.construct(String, ['A']);
    // @ts-expect-error Intentional invalid boxed text.
    expectInvalid(() => matchBrandLiteralBlocks(boxed, ['A']));
  });
  it('rejects nonarray, subclass and custom prototype input', () => {
    // @ts-expect-error Intentional invalid nonarray catalogue.
    expectInvalid(() => matchBrandLiteralBlocks('A', { 0: 'A', length: 1 }));
    class Catalogue extends Array<string> {}
    expectInvalid(() => matchBrandLiteralBlocks('A', new Catalogue('A')));
    const altered = ['A'];
    Object.setPrototypeOf(altered, null);
    expectInvalid(() => matchBrandLiteralBlocks('A', altered));
  });
  it('rejects sparse/accessor/nonenumerable/nonstring elements without getter execution', () => {
    expectInvalid(() => matchBrandLiteralBlocks('A', new Array<string>(1)));
    const getter = vi.fn(() => 'A');
    const accessor = ['A'];
    Object.defineProperty(accessor, '0', { get: getter });
    expectInvalid(() => matchBrandLiteralBlocks('A', accessor));
    expect(getter).not.toHaveBeenCalled();
    const hidden = ['A'];
    Object.defineProperty(hidden, '0', { value: 'A', enumerable: false });
    expectInvalid(() => matchBrandLiteralBlocks('A', hidden));
    // @ts-expect-error Intentional invalid nonstring literal.
    expectInvalid(() => matchBrandLiteralBlocks('A', [1]));
  });
  it.each(['', ' \r\n\t\u00a0'])(
    'rejects empty normalized literal even with invisible actual text',
    (literal) => {
      expectInvalid(() => matchBrandLiteralBlocks('', [literal]));
    },
  );
  it('rejects Proxy and revoked Proxy before any trap', () => {
    const trap = vi.fn(() => {
      throw new Error('must not execute');
    });
    const proxy = new Proxy(['A'], {
      get: trap,
      getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap,
      ownKeys: trap,
    });
    expectInvalid(() => matchBrandLiteralBlocks('A', proxy));
    expect(trap).not.toHaveBeenCalled();
    const revoked = Proxy.revocable(['A'], {});
    revoked.revoke();
    expectInvalid(() => matchBrandLiteralBlocks('A', revoked.proxy));
  });
  it('ignores iterator/symbol/named extras and 1000 irrelevant accessor properties', () => {
    const literals = ['A'];
    const getter = vi.fn(() => {
      throw new Error('must not execute');
    });
    Object.defineProperty(literals, Symbol.iterator, { get: getter });
    Object.defineProperty(literals, Symbol('extra'), { get: getter });
    for (let index = 0; index < 1000; index++)
      Object.defineProperty(literals, `extra${index}`, { get: getter });
    expect(matchBrandLiteralBlocks('A', literals)).toEqual([0]);
    expect(getter).not.toHaveBeenCalled();
  });
  it('checks raw limits before indexed access or normalization', () => {
    expect(matchBrandLiteralBlocks('x'.repeat(100001), [])).toBe(
      'factual_coverage_work_limit',
    );
    expect(matchBrandLiteralBlocks('A', ['x'.repeat(4001)])).toBe(
      'factual_coverage_work_limit',
    );
    const oversized = new Array<string>(129);
    const getter = vi.fn(() => 'A');
    Object.defineProperty(oversized, '0', { get: getter });
    expect(matchBrandLiteralBlocks('A', oversized)).toBe(
      'factual_coverage_work_limit',
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it('accepts structural 100000/4000/128 bounds and rejects normalized expansion', () => {
    expect(matchBrandLiteralBlocks(`${' '.repeat(99999)}A`, ['A'])).toEqual([
      0,
    ]);
    expect(
      matchBrandLiteralBlocks('x'.repeat(4000), ['x'.repeat(4000)]),
    ).toEqual([0]);
    expect(
      matchBrandLiteralBlocks('A', [
        'A',
        ...Array.from({ length: 127 }, () => 'B'),
      ]),
    ).toEqual([0]);
    expect(matchBrandLiteralBlocks('A', ['\u0344'.repeat(2001)])).toBe(
      'factual_coverage_work_limit',
    );
  });
});

describe('one inclusive 4000000-unit budget for complete matching', () => {
  it('accepts exactly 4000000 units and rejects 4000001 on final reconstruction', () => {
    const text = Array.from({ length: 10023 }, () => 'aa').join('\n\n');
    const literals = ['aa', ...Array.from({ length: 127 }, () => 'ab')];
    const expected = Array.from({ length: 10023 }, () => 0);
    const inclusive = `${' '.repeat(159)}${text}`;
    const overflow = `${' '.repeat(158)}\r\n${text}`;
    for (let repetition = 0; repetition < 2; repetition++) {
      expect(matchBrandLiteralBlocks(inclusive, literals)).toEqual(expected);
      expect(matchBrandLiteralBlocks(overflow, literals)).toBe(
        'factual_coverage_work_limit',
      );
    }
  });
  it('does not return the first whole-text match before later work exhaustion', () => {
    const text = Array.from({ length: 1333 }, () => 'a').join('\n\n');
    const decoy = `${Array.from({ length: 666 }, () => 'a').join('\n\n')}b`;
    expect(decoy.length).toBe(1997);
    expect(
      matchBrandLiteralBlocks(text, [
        text,
        'a',
        ...Array.from({ length: 126 }, () => decoy),
      ]),
    ).toBe('factual_coverage_work_limit');
  });
  it('bounds repeated common prefixes without returning partial indices', () => {
    const literal = 'a'.repeat(1900);
    const text = Array.from({ length: 50 }, () => literal).join('\n\n');
    expect(
      matchBrandLiteralBlocks(
        text,
        Array.from({ length: 120 }, () => literal),
      ),
    ).toBe('factual_coverage_work_limit');
  });
  it('accepts a long LF separator within the fixed budget', () => {
    expect(
      matchBrandLiteralBlocks(`A${'\n'.repeat(99998)}B`, ['A', 'B']),
    ).toEqual([0, 1]);
  });
});
