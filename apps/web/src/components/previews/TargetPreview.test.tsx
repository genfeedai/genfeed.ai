import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import {
  CredentialPlatform,
  ReleaseAttachmentKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  makeAttachment,
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';
import TargetPreview from './TargetPreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('TargetPreview', () => {
  it('routes a known platform to its dedicated renderer', () => {
    render(
      <TargetPreview
        credential={makeCredential({ platform: CredentialPlatform.TWITTER })}
        release={makeRelease({ baseContent: 'x'.repeat(300) })}
        target={makeTarget({ platform: CredentialPlatform.TWITTER })}
      />,
    );

    // X truncates at 280 chars — proof the dedicated XPreview rendered.
    expect(screen.getByText(`${'x'.repeat(280)}...`)).toBeInTheDocument();
  });

  it('shows the recorded publication outcome for a historical Instagram target', () => {
    const preview = (executionState: TargetExecutionState) => (
      <TargetPreview
        credential={makeCredential()}
        release={makeRelease({
          media: [{ assetId: 'slide-1', kind: 'image', order: 0 }],
        })}
        target={makeTarget({ executionState })}
      />
    );

    const { rerender } = render(preview(TargetExecutionState.DRAFT));
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(
      screen.getByText(/Instagram requires Placement/),
    ).toBeInTheDocument();

    rerender(preview(TargetExecutionState.PUBLISHED));
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Instagram requires Placement/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('platform-preview-media-slide-1'),
    ).toBeInTheDocument();
  });

  it('falls back to a neutral card for a platform with no dedicated renderer', () => {
    render(
      <TargetPreview
        credential={makeCredential({ platform: CredentialPlatform.MEDIUM })}
        release={makeRelease({ baseContent: 'Untruncated fallback caption' })}
        target={makeTarget({ platform: CredentialPlatform.MEDIUM })}
      />,
    );

    expect(
      screen.getByText('Untruncated fallback caption'),
    ).toBeInTheDocument();
  });
});

it('keeps target caption overrides, scoped signatures, first comments and ordered media in the canonical renderer', () => {
  render(
    <TargetPreview
      credential={makeCredential()}
      release={makeRelease({
        baseContent: 'Shared caption',
        media: [
          {
            assetId: 'later',
            order: 2,
            kind: 'video',
            url: 'https://example.com/later.mp4',
          },
          {
            assetId: 'first',
            order: 1,
            kind: 'video',
            url: 'https://example.com/first.mp4',
          },
        ],
        attachments: [
          makeAttachment({
            body: 'Brand signature',
            kind: ReleaseAttachmentKind.SIGNATURE,
          }),
          makeAttachment({
            body: 'Other target',
            kind: ReleaseAttachmentKind.SIGNATURE,
            targetId: 'other',
          }),
          makeAttachment({
            body: 'First reply',
            kind: ReleaseAttachmentKind.COMMENT,
          }),
        ],
      })}
      target={makeTarget({
        platform: CredentialPlatform.TWITTER,
        settings: { caption: 'Override' },
      })}
    />,
  );
  expect(screen.getByText(/Override/)).toHaveTextContent('Brand signature');
  expect(screen.queryByText('Other target')).not.toBeInTheDocument();
  expect(screen.getByTestId('preview-first-comment')).toHaveTextContent(
    'First reply',
  );
  expect(
    screen
      .getAllByLabelText(/Video \d/)
      .map((video) => video.getAttribute('src')),
  ).toEqual(['https://example.com/first.mp4', 'https://example.com/later.mp4']);
});
