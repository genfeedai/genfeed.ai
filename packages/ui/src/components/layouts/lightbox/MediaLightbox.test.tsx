import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', async () => {
  const { default: Lightbox } = await import('yet-another-react-lightbox');
  return { default: () => Lightbox };
});

vi.mock('@genfeedai/hooks/ui/use-dominant-color/use-dominant-color', () => ({
  useDominantColor: () => null,
}));

const image = {
  id: 'apple',
  ingredientUrl: 'https://example.com/apple.jpg',
  thumbnailUrl: 'https://example.com/apple.jpg',
  metadataLabel: 'Apple',
} as IIngredient;

describe('MediaLightbox', () => {
  it('opens the real viewer while the dominant colour is unavailable', async () => {
    render(
      <MediaLightbox items={[image]} open startIndex={0} onClose={vi.fn()} />,
    );
    expect(
      await screen.findByRole('dialog', { name: 'Lightbox' }),
    ).toBeInTheDocument();
  });

  it('does not mount a closed viewer', () => {
    render(
      <MediaLightbox
        items={[image]}
        open={false}
        startIndex={0}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not mount a viewer without slides', () => {
    render(<MediaLightbox items={[]} open startIndex={0} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
