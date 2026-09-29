import { IngredientCategory } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LibraryAssetTypeBadge from './library-asset-type-badge';

describe('LibraryAssetTypeBadge', () => {
  it('renders VIDEO and VIDEO_EDIT as the same muted Video pill', () => {
    const { rerender } = render(
      <LibraryAssetTypeBadge category={IngredientCategory.VIDEO} />,
    );

    expect(
      screen.getByText('Video').closest('[class*="bg-primary/15"]'),
    ).not.toBeNull();
    expect(screen.queryByText('VIDEO')).not.toBeInTheDocument();

    rerender(
      <LibraryAssetTypeBadge category={IngredientCategory.VIDEO_EDIT} />,
    );

    expect(
      screen.getByText('Video').closest('[class*="bg-primary/15"]'),
    ).not.toBeNull();
  });
});
