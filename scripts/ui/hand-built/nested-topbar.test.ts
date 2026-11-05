import { describe, expect, it } from 'vitest';
import { detectNestedTopbarViolations } from './nested-topbar';

function linesFor(source: string): number[] {
  return detectNestedTopbarViolations('apps/web/Sample.tsx', source).map(
    (violation) => violation.line,
  );
}

describe('nested-topbar guard', () => {
  it.each([
    `<Container label="A"><SectionTopbar title="B" /></Container>`,
    `<AdminPageShell title="A"><div><SectionTopbar title="B" /></div></AdminPageShell>`,
    `<Container label="A">{isReady ? <SectionTopbar title="B" /> : null}</Container>`,
  ])('blocks a second bar inside a page body: %s', (element) => {
    expect(linesFor(`export default function A(){return ${element};}`)).toEqual(
      [1],
    );
  });

  it.each([
    `<><SectionTopbar title="B" /><Container moduleChrome={false}>body</Container></>`,
    `<Container leading={<SectionTopbar title="B" />}>body</Container>`,
    `<Container label="A"><Card label="B" /></Container>`,
  ])('lets one bar through: %s', (element) => {
    expect(linesFor(`export default function A(){return ${element};}`)).toEqual(
      [],
    );
  });

  it('honours the escape hatch with a reason', () => {
    expect(
      linesFor(
        [
          'export default function A(){return (<Container label="A">',
          '  {/* ui-guard-allow:nested-topbar -- embedded preview of a page */}',
          '  <SectionTopbar title="B" />',
          '</Container>);}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
