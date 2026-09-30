import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import {
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import TikTokPreview from './TikTokPreview';

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

describe('TikTokPreview', () => {
  it('truncates the caption at the TikTok 2200-character limit', () => {
    const caption = 'x'.repeat(2210);
    render(
      <TikTokPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: caption })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText(`${'x'.repeat(2200)}...`)).toBeInTheDocument();
  });

  it('renders media at the TikTok 9:16 aspect', () => {
    render(
      <TikTokPreview
        credential={makeCredential()}
        release={makeRelease({
          media: [
            {
              assetId: 'asset-1',
              kind: 'video',
              url: 'https://cdn.example/a.mp4',
            },
          ],
        })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByTestId('preview-media')).toHaveAttribute(
      'data-media-aspect',
      '9:16',
    );
  });

  it('styles a caption hashtag as a highlighted entity', () => {
    render(
      <TikTokPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: 'Trending now #fyp' })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByTestId('preview-entity')).toHaveTextContent('#fyp');
  });
});
