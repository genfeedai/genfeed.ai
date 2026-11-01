import { describe, expect, it } from 'vitest';
import { detectViewTabsViolations } from './view-tabs';

function linesFor(source: string): number[] {
  return detectViewTabsViolations('apps/web/Sample.tsx', source).map(
    (violation) => violation.line,
  );
}

describe('view-tabs guard', () => {
  it.each([
    `<Tabs ariaLabel="Calendar view" items={items} />`,
    `<Tabs ariaLabel={translate('viewAria')} items={items} />`,
    `<Tabs ariaLabel={labels.views} items={items} />`,
    `<Tabs ariaLabel="Analytics period" items={items} />`,
    `<Tabs ariaLabel="Status filter" items={items} />`,
  ])('blocks tabs that switch a view or filter: %s', (element) => {
    expect(linesFor(`export default function A(){return ${element};}`)).toEqual(
      [1],
    );
  });

  it.each([
    `<Tabs ariaLabel={translate('tabs.preview')} items={items} />`,
    `<Tabs ariaLabel="Campaign sections" items={items} />`,
    `<Tabs items={items} />`,
  ])('lets section tabs through: %s', (element) => {
    expect(linesFor(`export default function A(){return ${element};}`)).toEqual(
      [],
    );
  });

  it('honours the escape hatch with a reason', () => {
    expect(
      linesFor(
        [
          'export default function A(){return (',
          '  // ui-guard-allow:view-tabs -- preview frames, not a page view',
          '  <Tabs ariaLabel="Frame view" items={items} />',
          ');}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
