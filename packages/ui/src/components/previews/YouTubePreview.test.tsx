import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { ReleaseAttachmentKind } from '@genfeedai/enums';
import {
  makeAttachment,
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import YouTubePreview from './YouTubePreview';

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

describe('YouTubePreview', () => {
  it('renders the release title above the description', () => {
    render(
      <YouTubePreview
        credential={makeCredential()}
        release={makeRelease({ title: 'How Genfeed ships previews' })}
        target={makeTarget()}
      />,
    );

    expect(
      screen.getAllByText('How Genfeed ships previews').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders media at the YouTube 16:9 aspect', () => {
    render(
      <YouTubePreview
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

  it('appends a single signature attachment to the description exactly once', () => {
    const target = makeTarget({ id: 'target-1' });
    target.attachments = [
      makeAttachment({
        body: 'Subscribe for more!',
        kind: ReleaseAttachmentKind.SIGNATURE,
        targetId: 'target-1',
      }),
    ];

    render(
      <YouTubePreview
        credential={makeCredential()}
        release={makeRelease()}
        target={target}
      />,
    );

    const description = screen.getByText(/Hello from Genfeed/);
    expect(description.textContent?.match(/Subscribe for more!/g)).toHaveLength(
      1,
    );
  });
});
