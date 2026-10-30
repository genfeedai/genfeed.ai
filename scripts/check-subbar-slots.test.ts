import { describe, expect, it } from 'vitest';
import { findSubbarSlotViolations } from './check-subbar-slots';

const FILE = 'packages/pages/posts/list/posts-list.tsx';

describe('findSubbarSlotViolations', () => {
  it('flags a refresh button inside the controls', () => {
    expect(
      findSubbarSlotViolations(
        FILE,
        'export const a = <Container right={<div><ButtonRefresh /></div>} />;',
      ),
    ).toEqual([
      expect.objectContaining({
        file: FILE,
        line: 1,
        message: expect.stringContaining('`refresh` slot'),
      }),
    ]);
  });

  it('flags a Filters menu in free-form controls', () => {
    expect(
      findSubbarSlotViolations(
        FILE,
        'export const a = <SectionTopbar actions={<FilterMenu facets={[]} />} />;',
      ),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('outside SubbarControls'),
      }),
    ]);
  });

  it('accepts a Filters menu and a refresh in their own slots', () => {
    expect(
      findSubbarSlotViolations(
        FILE,
        [
          'export const a = (',
          '  <Container',
          '    refresh={<ButtonRefresh />}',
          '    right={<SubbarControls filters={<FilterMenu facets={[]} />} />}',
          '  />',
          ');',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('ignores controls on components that are not subbars', () => {
    expect(
      findSubbarSlotViolations(
        FILE,
        'export const a = <Card actions={<ButtonRefresh />} />;',
      ),
    ).toEqual([]);
  });
});
