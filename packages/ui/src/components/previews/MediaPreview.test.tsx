import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import MediaPreview from './MediaPreview';

type MockImageProps = ComponentProps<'img'> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: MockImageProps) => <img {...props} alt={props.alt ?? ''} />,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('MediaPreview', () => {
  it('renders nothing when the release has no media', () => {
    const { container } = render(<MediaPreview aspect="1:1" media={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an overflow badge when there is more than one media item', () => {
    render(
      <MediaPreview
        aspect="4:5"
        media={[
          { assetId: 'a', kind: 'image', url: 'https://cdn.example/a.jpg' },
          { assetId: 'b', kind: 'image', url: 'https://cdn.example/b.jpg' },
          { assetId: 'c', kind: 'image', url: 'https://cdn.example/c.jpg' },
        ]}
      />,
    );

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('falls back to a text placeholder when the media has no resolved URL', () => {
    render(
      <MediaPreview aspect="9:16" media={[{ assetId: 'a', kind: 'video' }]} />,
    );

    expect(screen.getByText('video')).toBeInTheDocument();
  });

  it.each([
    ['1:1'] as const,
    ['4:5'] as const,
    ['9:16'] as const,
    ['16:9'] as const,
  ])('exposes the %s aspect via a data attribute', (aspect) => {
    render(
      <MediaPreview
        aspect={aspect}
        media={[
          { assetId: 'a', kind: 'image', url: 'https://cdn.example/a.jpg' },
        ]}
      />,
    );

    expect(screen.getByTestId('preview-media')).toHaveAttribute(
      'data-media-aspect',
      aspect,
    );
  });
});
