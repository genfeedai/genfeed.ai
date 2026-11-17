import { describe, expect, it } from 'vitest';
import {
  type EffectCounts,
  evaluateEffects,
  findEffectFindings,
  formatEffectSummary,
  toCounts,
  useEffectBaselineEntryKeys,
} from './check-use-effect';

const FILE = 'apps/web/src/components/Example.tsx';

function kinds(source: string): string[] {
  return findEffectFindings(FILE, source).map(
    (finding) => `${finding.kind}@${finding.line}`,
  );
}

describe('findEffectFindings', () => {
  it('counts a plain useEffect call', () => {
    expect(
      kinds(
        [
          "import { useEffect } from 'react';",
          'export default function Example() {',
          '  useEffect(() => {',
          '    document.title = "x";',
          '  }, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@3']);
  });

  it('counts React.useEffect and an aliased import', () => {
    expect(
      kinds(
        [
          "import React, { useEffect as runEffect } from 'react';",
          'export default function Example() {',
          '  React.useEffect(() => undefined, []);',
          '  runEffect(() => undefined, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@3', 'use_effect@4']);
  });

  it('counts a namespace import of react', () => {
    expect(
      kinds(
        [
          "import * as R from 'react';",
          'export default function Example() {',
          '  R.useEffect(() => undefined, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@3']);
  });

  it('does not count a useEffect method on an unrelated object', () => {
    expect(
      kinds(
        [
          "import React from 'react';",
          'const lifecycle = { useEffect() {} };',
          'export default function Example() {',
          '  lifecycle.useEffect();',
          '  return React.createElement("div");',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('does not count useLayoutEffect or a mention in a comment or string', () => {
    expect(
      kinds(
        [
          "import { useLayoutEffect } from 'react';",
          '// useEffect(() => {}, [])',
          "const text = 'useEffect(() => {}, [])';",
          'export default function Example() {',
          '  useLayoutEffect(() => undefined, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('flags an async effect that never aborts', () => {
    expect(
      kinds(
        [
          'export default function Example() {',
          '  useEffect(() => {',
          '    async function load() {',
          '      await fetchItems();',
          '    }',
          '    void load();',
          '  }, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@2', 'async_effect_without_abort@2']);
  });

  it('flags a promise chain and a bare fetch', () => {
    expect(
      kinds(
        [
          'export default function Example() {',
          '  useEffect(() => {',
          '    loadItems().then(setItems);',
          '  }, []);',
          '  useEffect(() => {',
          '    void fetch("/items");',
          '  }, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      'use_effect@2',
      'async_effect_without_abort@2',
      'use_effect@5',
      'async_effect_without_abort@5',
    ]);
  });

  it('accepts an async effect that owns an AbortController', () => {
    expect(
      kinds(
        [
          'export default function Example() {',
          '  useEffect(() => {',
          '    const controller = new AbortController();',
          '    void fetch("/items", { signal: controller.signal });',
          '    return () => controller.abort();',
          '  }, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@2']);
  });

  it('skips an effect marked with an audit comment that gives a reason', () => {
    expect(
      kinds(
        [
          'export default function Example() {',
          '  // use-effect-audit: ignore subscribes to the browser online event',
          '  useEffect(() => {',
          '    window.addEventListener("online", onOnline);',
          '    return () => window.removeEventListener("online", onOnline);',
          '  }, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('does not accept an audit comment without a reason', () => {
    expect(
      kinds(
        [
          'export default function Example() {',
          '  // use-effect-audit: ignore',
          '  useEffect(() => undefined, []);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['use_effect@3']);
  });

  it('reads a .ts file with a generic parameter', () => {
    expect(
      findEffectFindings(
        'packages/hooks/use-thing.ts',
        [
          'export function useThing<T>(value: T): T {',
          '  useEffect(() => undefined, []);',
          '  return value;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      { file: 'packages/hooks/use-thing.ts', kind: 'use_effect', line: 2 },
    ]);
  });
});

describe('evaluateEffects', () => {
  const counts = (
    useEffect: Record<string, number>,
    asyncWithoutAbort: Record<string, number> = {},
  ): EffectCounts => ({
    async_effect_without_abort: asyncWithoutAbort,
    use_effect: useEffect,
  });

  it('passes when every count equals its baseline', () => {
    expect(
      evaluateEffects(counts({ 'a.tsx': 2 }), counts({ 'a.tsx': 2 })),
    ).toEqual([]);
  });

  it('fails a new file with an effect', () => {
    expect(
      evaluateEffects(
        counts({ 'a.tsx': 2 }),
        counts({ 'a.tsx': 2, 'b.tsx': 1 }),
      ),
    ).toEqual([
      {
        actual: 1,
        baseline: 0,
        file: 'b.tsx',
        kind: 'use_effect',
        type: 'new_file',
      },
    ]);
  });

  it('fails a file whose count rose', () => {
    expect(
      evaluateEffects(counts({ 'a.tsx': 2 }), counts({ 'a.tsx': 3 })),
    ).toEqual([
      {
        actual: 3,
        baseline: 2,
        file: 'a.tsx',
        kind: 'use_effect',
        type: 'growth',
      },
    ]);
  });

  it('fails a file whose count fell until the baseline is pruned', () => {
    expect(
      evaluateEffects(counts({ 'a.tsx': 2 }), counts({ 'a.tsx': 1 })),
    ).toEqual([
      {
        actual: 1,
        baseline: 2,
        file: 'a.tsx',
        kind: 'use_effect',
        type: 'stale_baseline',
      },
    ]);
  });

  it('tracks async effects without an abort separately', () => {
    expect(
      evaluateEffects(
        counts({ 'a.tsx': 1 }, {}),
        counts({ 'a.tsx': 1 }, { 'a.tsx': 1 }),
      ),
    ).toEqual([
      {
        actual: 1,
        baseline: 0,
        file: 'a.tsx',
        kind: 'async_effect_without_abort',
        type: 'new_file',
      },
    ]);
  });
});

describe('summary and baseline keys', () => {
  it('names the fix for a new effect', () => {
    const actual = toCounts([{ file: 'b.tsx', kind: 'use_effect', line: 4 }]);
    const summary = formatEffectSummary(
      actual,
      evaluateEffects(toCounts([]), actual),
    );

    expect(summary).toContain('[NEW use_effect] b.tsx: 1 > baseline 0');
    expect(summary).toContain('derive the value during render');
  });

  it('keys the baseline once per counted effect', () => {
    expect(
      useEffectBaselineEntryKeys(
        JSON.stringify({
          async_effect_without_abort: { 'b.tsx': 1 },
          use_effect: { 'a.tsx': 2 },
        }),
      ),
    ).toEqual([
      'use_effect|a.tsx',
      'use_effect|a.tsx',
      'async_effect_without_abort|b.tsx',
    ]);
  });
});
