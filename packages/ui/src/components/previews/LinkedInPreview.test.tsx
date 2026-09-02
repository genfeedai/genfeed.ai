import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { ReleaseAttachmentKind } from '@genfeedai/enums';
import LinkedInPreview from './LinkedInPreview';
import {
  makeAttachment,
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';

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

describe('LinkedInPreview', () => {
  it('truncates the caption at the LinkedIn 3000-character limit', () => {
    const caption = 'x'.repeat(3010);
    render(
      <LinkedInPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: caption })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText(`${'x'.repeat(3000)}...`)).toBeInTheDocument();
  });

  it('renders media at the LinkedIn 1:1 aspect', () => {
    render(
      <LinkedInPreview
        credential={makeCredential()}
        release={makeRelease({
          media: [
            {
              assetId: 'asset-1',
              kind: 'image',
              url: 'https://cdn.example/a.jpg',
            },
          ],
        })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByTestId('preview-media')).toHaveAttribute(
      'data-media-aspect',
      '1:1',
    );
  });

  it('places the first comment beneath the caption', () => {
    const target = makeTarget();
    target.attachments = [
      makeAttachment({
        body: 'Thanks for reading!',
        kind: ReleaseAttachmentKind.COMMENT,
      }),
    ];

    render(
      <LinkedInPreview
        credential={makeCredential()}
        release={makeRelease()}
        target={target}
      />,
    );

    expect(screen.getByTestId('preview-first-comment')).toHaveTextContent(
      'Thanks for reading!',
    );
  });
});
