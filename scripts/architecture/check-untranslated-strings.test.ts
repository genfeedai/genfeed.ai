import { describe, expect, it } from 'vitest';
import {
  assertLowerOnlyBaselineUpdate,
  buildUntranslatedStringBaseline,
  diffUntranslatedStringBaseline,
  findUntranslatedStrings,
  UNTRANSLATED_STRING_FIX_HELP,
  UNTRANSLATED_STRING_IGNORE_GLOBS,
  type UntranslatedStringBaseline,
} from './check-untranslated-strings';

function baseline(files: Record<string, number>): UntranslatedStringBaseline {
  return { files, version: 1 };
}

describe('findUntranslatedStrings', () => {
  it('counts meaningful JSX text and direct string children', () => {
    const occurrences = findUntranslatedStrings(
      `
        export function Example() {
          return (
            <>
              <h1>Account settings</h1>
              <button>{'Save changes'}</button>
              <span>{\`Retry now\`}</span>
            </>
          );
        }
      `,
      'apps/app/example.tsx',
    );

    expect(occurrences.map((entry) => entry.text)).toEqual([
      'Account settings',
      'Save changes',
      'Retry now',
    ]);
  });

  it('ignores catalog calls, whitespace, numbers, and entity-only text', () => {
    const occurrences = findUntranslatedStrings(`
      export function Example() {
        const t = useTranslations('common');
        return <div>{t('actions.save')} 2026 &nbsp; &#8594;</div>;
      }
    `);

    expect(occurrences).toEqual([]);
  });

  it('pins the documented floor by ignoring props, helpers, and runtime templates', () => {
    const occurrences = findUntranslatedStrings(`
      const helperCopy = 'Built in a helper';
      export function Example({name}: {name: string}) {
        return (
          <Card
            description="Passed through a prop"
            title={'Also passed through a prop'}
          >
            {helperCopy}
            {\`Welcome \${name}\`}
          </Card>
        );
      }
    `);

    expect(occurrences).toEqual([]);
  });
});

describe('untranslated-string fix guidance', () => {
  it('points the correct fix at the host catalog instead of COPY consts', () => {
    expect(UNTRANSLATED_STRING_FIX_HELP).toMatch(/apps\/app\/messages\/en/u);
    expect(UNTRANSLATED_STRING_FIX_HELP).toMatch(/useTranslations/u);
    expect(UNTRANSLATED_STRING_FIX_HELP).toMatch(/getTranslations/u);
    expect(UNTRANSLATED_STRING_FIX_HELP).toMatch(/COPY const/u);
    expect(UNTRANSLATED_STRING_FIX_HELP).toMatch(
      /namespaces ui, pages, agent, contexts/u,
    );
  });

  it('keeps standalone terminal JSX outside the Next.js catalog ratchet', () => {
    expect(UNTRANSLATED_STRING_IGNORE_GLOBS).toContain('packages/cli/**');
  });
});

describe('untranslated-string baseline', () => {
  it('builds stable per-file counts', () => {
    expect(
      buildUntranslatedStringBaseline([
        { file: 'z.tsx', line: 1, text: 'One' },
        { file: 'a.tsx', line: 1, text: 'Two' },
        { file: 'z.tsx', line: 2, text: 'Three' },
      ]),
    ).toEqual(baseline({ 'a.tsx': 1, 'z.tsx': 2 }));
  });

  it('reports both growth and stale cleanup', () => {
    expect(
      diffUntranslatedStringBaseline(
        baseline({ 'cleaned.tsx': 3, 'grown.tsx': 1 }),
        baseline({ 'cleaned.tsx': 2, 'grown.tsx': 2 }),
      ),
    ).toEqual({
      regressions: [{ actual: 2, baseline: 1, file: 'grown.tsx' }],
      stale: [{ actual: 2, baseline: 3, file: 'cleaned.tsx' }],
    });
  });

  it('accepts a strictly lower baseline with no per-file growth', () => {
    expect(() =>
      assertLowerOnlyBaselineUpdate(
        baseline({ 'a.tsx': 2, 'b.tsx': 1 }),
        baseline({ 'a.tsx': 1, 'b.tsx': 1 }),
      ),
    ).not.toThrow();
  });

  it('rejects an equal or higher total', () => {
    expect(() =>
      assertLowerOnlyBaselineUpdate(
        baseline({ 'a.tsx': 2 }),
        baseline({ 'a.tsx': 2 }),
      ),
    ).toThrow(/total must decrease/u);
  });

  it('rejects per-file growth even when the repository total is lower', () => {
    expect(() =>
      assertLowerOnlyBaselineUpdate(
        baseline({ 'cleaned.tsx': 10, 'grown.tsx': 1 }),
        baseline({ 'cleaned.tsx': 1, 'grown.tsx': 2 }),
      ),
    ).toThrow(/per-file count grew/u);
  });
});
