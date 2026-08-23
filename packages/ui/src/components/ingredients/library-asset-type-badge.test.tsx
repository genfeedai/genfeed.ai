import { IngredientCategory } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LibraryAssetTypeBadge from './library-asset-type-badge';

describe('LibraryAssetTypeBadge', () => {
  it('renders VIDEO and VIDEO_EDIT as the same muted Video pill', () => {
    const { rerender } = render(
      <LibraryAssetTypeBadge category={IngredientCategory.VIDEO} />,
    );

    expect(
      screen.getByText('Video').closest('[class*="bg-purple-500/20"]'),
    ).not.toBeNull();
    expect(screen.queryByText('VIDEO')).not.toBeInTheDocument();

    rerender(
      <LibraryAssetTypeBadge category={IngredientCategory.VIDEO_EDIT} />,
    );

    expect(
      screen.getByText('Video').closest('[class*="bg-purple-500/20"]'),
    ).not.toBeNull();
  });

  it('renders Image, GIF, Avatar, Audio, Voice, and Text with muted colors', () => {
    const { rerender } = render(
      <LibraryAssetTypeBadge category={IngredientCategory.IMAGE} />,
    );
    expect(
      screen.getByText('Image').closest('[class*="bg-blue-500/20"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.GIF} />);
    expect(
      screen.getByText('GIF').closest('[class*="bg-cyan-500/20"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.AVATAR} />);
    expect(
      screen.getByText('Avatar').closest('[class*="bg-indigo-500/20"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.MUSIC} />);
    expect(
      screen.getByText('Audio').closest('[class*="bg-orange-500/20"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.VOICE} />);
    expect(
      screen.getByText('Voice').closest('[class*="bg-amber-500/20"]'),
    ).not.toBeNull();

    rerender(<LibraryAssetTypeBadge category={IngredientCategory.TEXT} />);
    expect(
      screen.getByText('Text').closest('[class*="bg-success/10"]'),
    ).not.toBeNull();
  });
});
