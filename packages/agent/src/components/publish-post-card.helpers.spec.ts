import { PostVisibility } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  readPublishTargetProposals,
  resolveEffectiveCaption,
  resolveLiveTargetBlockers,
  targetAccount,
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

  it('maps a target onto the connected account the post goes to', () => {
    expect(
      targetAccount({
        avatarUrl: 'https://cdn.example/avatar.png',
        blockers: [],
        credentialId: 'cred-twitter',
        handle: 'genfeedai',
        id: 'publish-target-cred-twitter',
        label: 'X (Twitter)',
        name: 'Genfeed',
        platform: 'twitter',
        settings: {},
        visibility: PostVisibility.PUBLIC,
      }),
    ).toEqual({
      avatarUrl: 'https://cdn.example/avatar.png',
      handle: 'genfeedai',
      name: 'Genfeed',
      platform: 'twitter',
    });
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
        handle: 'genfeedtv',
        avatarUrl: 'https://cdn.example/yt.png',
      },
    ]);

    expect(target).toEqual(
      expect.objectContaining({
        credentialId: 'cred-youtube',
        handle: 'genfeedtv',
        isSelected: true,
        avatarUrl: 'https://cdn.example/yt.png',
        platform: 'youtube',
        visibility: PostVisibility.PUBLIC,
      }),
    );
    expect(target?.blockers[0]?.message).toBe(
      'YouTube does not support image media.',
    );
  });
});
