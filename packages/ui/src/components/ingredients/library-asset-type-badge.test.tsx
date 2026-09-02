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
    expect(screen.getByText('Video').className).toContain('border');
    expect(screen.queryByText('VIDEO')).not.toBeInTheDocument();

    rerender(
      <LibraryAssetTypeBadge category={IngredientCategory.VIDEO_EDIT} />,
    );

    expect(
      screen.getByText('Video').closest('[class*="bg-primary/15"]'),
    ).not.toBeNull();
  });

  it('renders Image, GIF, Avatar, Audio, Voice, and Text with muted colors', () => {
    const { rerender } = render(
      <LibraryAssetTypeBadge category={IngredientCategory.IMAGE} />,
    );
    expect(
      screen.getByText('Image').closest('[class*="bg-info/15"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.GIF} />);
    expect(
      screen.getByText('GIF').closest('[class*="bg-info/15"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.AVATAR} />);
    expect(
      screen.getByText('Avatar').closest('[class*="bg-info/15"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.MUSIC} />);
    expect(
      screen.getByText('Audio').closest('[class*="bg-warning/15"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.VOICE} />);
    expect(
      screen.getByText('Voice').closest('[class*="bg-warning/15"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.TEXT} />);
    expect(
      screen.getByText('Text').closest('[class*="bg-success/10"]'),
    ).not.toBeNull();
  });
});
