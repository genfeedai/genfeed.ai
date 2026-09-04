import ReleaseRailSegments from '@pages/posts/rail/release-rail-segments';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

describe('ReleaseRailSegments', () => {
  it('uses the shared tabs and changes the active segment', () => {
    const onSegmentChange = vi.fn();

    render(
      <ReleaseRailSegments onSegmentChange={onSegmentChange} segment="all" />,
    );

    expect(screen.getByRole('tablist')).toHaveClass('gap-1');
    screen.getByRole('tab', { name: /published/i }).click();
    expect(onSegmentChange).toHaveBeenCalledWith('published');
  });
});
