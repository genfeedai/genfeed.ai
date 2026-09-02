import { PostVisibility } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  readPublishTargetProposals,
  resolveEffectiveCaption,
  resolveLiveTargetBlockers,
  targetToggleName,
} from './publish-post-card.helpers';

describe('publish-post-card.helpers', () => {
  it('keeps a shared caption unless a target override is present', () => {
    expect(resolveEffectiveCaption('Shared caption', undefined)).toBe(
      'Shared caption',
    );
    expect(resolveEffectiveCaption('Shared caption', '   ')).toBe(
      'Shared caption',
    );
    expect(resolveEffectiveCaption('Shared caption', 'X-only caption')).toBe(
      'X-only caption',
    );
  });

  it('blocks a YouTube image target with a target-specific capability reason', () => {
    const blockers = resolveLiveTargetBlockers({
      caption: 'Launch clip',
      credentialId: 'cred-youtube',
      media: [{ id: 'ingredient-1', kind: 'image' }],
      platform: 'youtube',
      publishMode: 'publish_now',
      settings: { madeForKids: false, privacyStatus: 'private' },
      visibility: PostVisibility.PUBLIC,
    });

    expect(blockers.map((blocker) => blocker.message)).toEqual(
      expect.arrayContaining(['YouTube does not support image media.']),
    );
  });

  it('disambiguates toggle names only when two targets share a platform', () => {
    const linkedin = {
      blockers: [],
      credentialId: 'cred-linkedin',
      id: 'publish-target-cred-linkedin',
      label: 'LinkedIn',
      platform: 'linkedin',
      settings: {},
      visibility: PostVisibility.PUBLIC,
    };
    const twitterA = {
      ...linkedin,
      credentialId: 'cred-twitter-a',
      id: 'publish-target-cred-twitter-a',
      label: 'X (Twitter)',
      platform: 'twitter',
    };
    const twitterB = {
      ...twitterA,
      credentialId: 'cred-twitter-b',
      id: 'publish-target-cred-twitter-b',
    };

    expect(targetToggleName(linkedin, [linkedin, twitterA])).toBe('linkedin');
    expect(targetToggleName(twitterA, [twitterA, twitterB])).toBe(
      'twitter cred-twitter-a',
    );
  });

  it('reads structured target proposals from the UI action contract', () => {
    const [target] = readPublishTargetProposals([
      {
        blockers: [
          {
            code: 'channel_target.unsupported_media_kind',
            field: 'media.0.kind',
            message: 'YouTube does not support image media.',
            severity: 'error',
          },
        ],
        caption: 'Launch clip',
        credentialId: 'cred-youtube',
        id: 'publish-target-cred-youtube',
        isSelected: true,
        label: 'YouTube',
        media: [{ id: 'ingredient-1', kind: 'image' }],
        platform: 'youtube',
        settings: { privacyStatus: 'private' },
        visibility: 'public',
      },
    ]);

    expect(target).toEqual(
      expect.objectContaining({
        credentialId: 'cred-youtube',
        isSelected: true,
        platform: 'youtube',
        visibility: PostVisibility.PUBLIC,
      }),
    );
    expect(target?.blockers[0]?.message).toBe(
      'YouTube does not support image media.',
    );
  });
});
