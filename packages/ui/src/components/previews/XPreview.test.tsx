import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import {
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import XPreview from './XPreview';

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

describe('XPreview', () => {
  it('truncates the caption at the X 280-character limit', () => {
    const caption = 'x'.repeat(300);
    render(
      <XPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: caption })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText(`${'x'.repeat(280)}...`)).toBeInTheDocument();
    expect(screen.getByText('280/280')).toBeInTheDocument();
  });

  it('renders media at the X 16:9 aspect', () => {
    render(
      <XPreview
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
      '16:9',
    );
  });

  it('styles a mentioned handle as a highlighted entity', () => {
    render(
      <XPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: 'Shipping now @genfeed' })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByTestId('preview-entity')).toHaveTextContent('@genfeed');
  });
});
