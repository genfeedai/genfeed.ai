import { CredentialPlatform, ReleaseAttachmentKind } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  getAuthorHandle,
  getAuthorName,
  getCaptionPreviewState,
  resolveFirstComment,
  resolveSignature,
  resolveTargetCaption,
} from './preview.helpers';
import {
  makeAttachment,
  makeCredential,
  makeRelease,
  makeTarget,
} from './preview.test-helpers';

describe('resolveTargetCaption', () => {
  it('falls back to the release base content with no target override', () => {
    const release = makeRelease({ baseContent: 'Shared caption' });
    const target = makeTarget({ settings: {} });

    expect(resolveTargetCaption(release, target)).toBe('Shared caption');
  });

  it('prefers a non-empty per-target caption override', () => {
    const release = makeRelease({ baseContent: 'Shared caption' });
    const target = makeTarget({
      settings: { caption: 'Instagram-only caption' },
    });

    expect(resolveTargetCaption(release, target)).toBe(
      'Instagram-only caption',
    );
  });

  it('ignores a blank override and falls back to the release caption', () => {
    const release = makeRelease({ baseContent: 'Shared caption' });
    const target = makeTarget({ settings: { caption: '   ' } });

    expect(resolveTargetCaption(release, target)).toBe('Shared caption');
  });
});

describe('getCaptionPreviewState', () => {
  it('does not truncate captions within the platform limit', () => {
    const state = getCaptionPreviewState('short caption', 280);

    expect(state.isTruncated).toBe(false);
    expect(state.text).toBe('short caption');
    expect(state.count).toBe(13);
  });

  it('truncates at the platform limit and appends an ellipsis', () => {
    const caption = 'x'.repeat(300);
    const state = getCaptionPreviewState(caption, 280);

    expect(state.isTruncated).toBe(true);
    expect(state.maxLength).toBe(280);
    expect(state.text).toBe(`${'x'.repeat(280)}...`);
  });

  it('is unicode-safe when counting and truncating', () => {
    const caption = '🎉'.repeat(10);
    const state = getCaptionPreviewState(caption, 5);

    expect(state.count).toBe(10);
    expect(state.text).toBe(`${'🎉'.repeat(5)}...`);
  });
});

describe('resolveSignature', () => {
  it('returns undefined when no signature attachment applies', () => {
    const release = makeRelease();
    const target = makeTarget();

    expect(resolveSignature(release, target)).toBeUndefined();
  });

  it('joins release-wide and target-scoped signatures exactly once, in order', () => {
    const target = makeTarget({ id: 'target-1' });
    const release = makeRelease({
      attachments: [
        makeAttachment({
          body: 'Global signature',
          kind: ReleaseAttachmentKind.SIGNATURE,
          order: 0,
          targetId: null,
        }),
      ],
    });
    target.attachments = [
      makeAttachment({
        body: 'Target signature',
        kind: ReleaseAttachmentKind.SIGNATURE,
        order: 1,
        targetId: 'target-1',
      }),
    ];

    const signature = resolveSignature(release, target);

    expect(signature).toBe('Global signature\nTarget signature');
    expect(signature?.match(/Global signature/g)).toHaveLength(1);
    expect(signature?.match(/Target signature/g)).toHaveLength(1);
  });

  it('excludes a signature scoped to a different target', () => {
    const target = makeTarget({ id: 'target-1' });
    target.attachments = [
      makeAttachment({
        body: 'Other target signature',
        kind: ReleaseAttachmentKind.SIGNATURE,
        targetId: 'target-2',
      }),
    ];
    const release = makeRelease();

    expect(resolveSignature(release, target)).toBeUndefined();
  });

  it('excludes a signature scoped to a different platform', () => {
    const target = makeTarget({ platform: CredentialPlatform.INSTAGRAM });
    const release = makeRelease({
      attachments: [
        makeAttachment({
          body: 'X-only signature',
          kind: ReleaseAttachmentKind.SIGNATURE,
          platform: CredentialPlatform.TWITTER,
        }),
      ],
    });

    expect(resolveSignature(release, target)).toBeUndefined();
  });
});

describe('resolveFirstComment', () => {
  it('surfaces only the lowest-order matching comment attachment', () => {
    const target = makeTarget();
    target.attachments = [
      makeAttachment({
        body: 'Second comment',
        kind: ReleaseAttachmentKind.COMMENT,
        order: 1,
      }),
      makeAttachment({
        body: 'First comment',
        kind: ReleaseAttachmentKind.COMMENT,
        order: 0,
      }),
    ];
    const release = makeRelease();

    expect(resolveFirstComment(release, target)).toBe('First comment');
  });

  it('returns undefined when no comment attachment applies', () => {
    const release = makeRelease();
    const target = makeTarget();

    expect(resolveFirstComment(release, target)).toBeUndefined();
  });
});

describe('author resolution', () => {
  it('prefers the external name, then label, then a default', () => {
    expect(getAuthorName(makeCredential({ externalName: 'Real Name' }))).toBe(
      'Real Name',
    );
    expect(
      getAuthorName(
        makeCredential({ externalName: undefined, label: 'Fallback Label' }),
      ),
    ).toBe('Fallback Label');
    expect(
      getAuthorName(
        makeCredential({ externalName: undefined, label: undefined }),
      ),
    ).toBe('Your Account');
  });

  it('normalizes the handle to always be @-prefixed', () => {
    expect(getAuthorHandle(makeCredential({ externalHandle: 'genfeed' }))).toBe(
      '@genfeed',
    );
    expect(
      getAuthorHandle(makeCredential({ externalHandle: '@genfeed' })),
    ).toBe('@genfeed');
    expect(getAuthorHandle(makeCredential({ externalHandle: undefined }))).toBe(
      '@youraccount',
    );
  });
});
