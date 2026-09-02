import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { ReleaseAttachmentKind } from '@genfeedai/enums';
import InstagramPreview from './InstagramPreview';
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

describe('InstagramPreview', () => {
  it('truncates the caption at the Instagram platform limit', () => {
    const caption = 'x'.repeat(2210);
    render(
      <InstagramPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: caption })}
        target={makeTarget()}
      />,
    );

    expect(screen.getByText(`${'x'.repeat(2200)}...`)).toBeInTheDocument();
  });

  it('styles hashtags and mentions as highlighted entities', () => {
    render(
      <InstagramPreview
        credential={makeCredential()}
        release={makeRelease({ baseContent: 'New drop #launch cc @genfeed' })}
        target={makeTarget()}
      />,
    );

    const entities = screen.getAllByTestId('preview-entity');
    expect(entities.map((node) => node.textContent)).toEqual([
      '#launch',
      '@genfeed',
    ]);
  });

  it('renders media at the Instagram 4:5 aspect', () => {
    render(
      <InstagramPreview
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
      '4:5',
    );
  });

  it('places the first comment beneath the caption', () => {
    const target = makeTarget();
    target.attachments = [
      makeAttachment({
        body: 'Link in bio!',
        kind: ReleaseAttachmentKind.COMMENT,
      }),
    ];

    render(
      <InstagramPreview
        credential={makeCredential()}
        release={makeRelease()}
        target={target}
      />,
    );

    const firstComment = screen.getByTestId('preview-first-comment');
    expect(firstComment).toHaveTextContent('Link in bio!');
  });

  it('appends a single signature attachment to the caption exactly once', () => {
    const target = makeTarget({ id: 'target-1' });
    target.attachments = [
      makeAttachment({
        body: 'Sent via Genfeed',
        kind: ReleaseAttachmentKind.SIGNATURE,
        order: 0,
        targetId: 'target-1',
      }),
    ];

    render(
      <InstagramPreview
        credential={makeCredential()}
        release={makeRelease()}
        target={target}
      />,
    );

    const caption = screen.getByText(/Hello from Genfeed/);
    expect(caption.textContent?.match(/Sent via Genfeed/g)).toHaveLength(1);
  });

  it('joins a release-wide signature with a target-scoped signature into one trailing block', () => {
    const target = makeTarget({ id: 'target-1' });
    const release = makeRelease({
      attachments: [
        makeAttachment({
          body: 'Powered by Genfeed',
          kind: ReleaseAttachmentKind.SIGNATURE,
          order: 0,
          targetId: null,
        }),
      ],
    });
    target.attachments = [
      makeAttachment({
        body: 'IG-only footer',
        kind: ReleaseAttachmentKind.SIGNATURE,
        order: 1,
        targetId: 'target-1',
      }),
    ];

    render(
      <InstagramPreview
        credential={makeCredential()}
        release={release}
        target={target}
      />,
    );

    const caption = screen.getByText(/Hello from Genfeed/);
    expect(caption.textContent?.match(/Powered by Genfeed/g)).toHaveLength(1);
    expect(caption.textContent?.match(/IG-only footer/g)).toHaveLength(1);
  });
});
