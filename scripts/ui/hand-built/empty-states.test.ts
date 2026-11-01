import { describe, expect, it } from 'vitest';
import { detectEmptyStateViolations } from './empty-states';

function rulesFor(source: string): string[] {
  return detectEmptyStateViolations('apps/web/Sample.tsx', source).map(
    (violation) => violation.rule,
  );
}

describe('empty states guard', () => {
  it.each([
    [
      'a padded centred "No …" block',
      `export default function A(){return <div className="text-center py-12"><p>No assets yet.</p></div>;}`,
    ],
    [
      'a centred flex column with "Nothing …" copy',
      `export default function A(){return <div className="flex flex-col items-center justify-center text-center"><p className="text-sm">Nothing to review</p></div>;}`,
    ],
    [
      'copy passed as a string expression',
      `export default function A(){return <p className="p-8 text-center">{'No results found'}</p>;}`,
    ],
  ])('blocks %s', (_name, source) => {
    expect(rulesFor(source)).toEqual(['hand-built']);
  });

  it.each([
    [
      'a centred heading without empty copy',
      `export default function A(){return <div className="text-center py-12"><h1>Welcome back</h1></div>;}`,
    ],
    [
      'a small centred "No …" caption',
      `export default function A(){return <p className="py-2 text-center">No credit card required</p>;}`,
    ],
    [
      'the shared primitive with layout classes',
      `export default function A(){return <EmptyState className="min-h-56 w-full" title="No assets" />;}`,
    ],
    [
      'an allowed spot with a reason',
      `export default function A(){return (
        // ui-guard-allow:empty-state -- marketing hero copy
        <div className="text-center py-12"><p>No lock-in</p></div>
      );}`,
    ],
  ])('allows %s', (_name, source) => {
    expect(rulesFor(source)).toEqual([]);
  });

  it('blocks restyling the shared EmptyState', () => {
    expect(
      rulesFor(
        `export default function A(){return <EmptyState className="py-20 bg-card text-lg" title="No assets" />;}`,
      ),
    ).toEqual(['restyle']);
  });

  it('blocks restyles behind a variant prefix', () => {
    expect(
      rulesFor(
        `export default function A(){return <EmptyState className="w-full md:px-12" title="No assets" />;}`,
      ),
    ).toEqual(['restyle']);
  });

  it('needs a reason on the escape hatch', () => {
    expect(
      rulesFor(`export default function A(){return (
        // ui-guard-allow:empty-state
        <div className="text-center py-12"><p>No lock-in</p></div>
      );}`),
    ).toEqual(['hand-built']);
  });
});
