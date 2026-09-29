import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { ReleaseAttachmentKind } from '@genfeedai/contracts';
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
