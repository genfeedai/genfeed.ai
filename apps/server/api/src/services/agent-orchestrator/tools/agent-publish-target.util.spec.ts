import {
  buildAgentPublishTargetProposals,
  collectInvalidTargetBlockers,
  formatTargetBlockersError,
  parseAgentPublishTargetPayloads,
  resolvePublishValidationMedia,
  toCanonicalChannelTarget,
} from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import { CredentialPlatform, PostVisibility } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('agent-publish-target.util', () => {
  it('builds one proposal per connected credential with effective settings', () => {
    const proposals = buildAgentPublishTargetProposals({
      caption: 'Ship this now',
      credentials: [
        { id: 'cred-linkedin', platform: 'LINKEDIN' },
        { id: 'cred-twitter', platform: 'twitter' },
      ],
      defaultPlatforms: ['linkedin', 'twitter'],
      media: [{ id: 'ingredient-1', kind: 'image' }],
      publishMode: 'publish_now',
      visibility: PostVisibility.PUBLIC,
    });

    expect(proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentialId: 'cred-linkedin',
          isSelected: true,
          label: 'LinkedIn',
          platform: CredentialPlatform.LINKEDIN,
          settings: expect.objectContaining({ visibility: 'PUBLIC' }),
        }),
        expect.objectContaining({
          credentialId: 'cred-twitter',
          isSelected: true,
          label: 'X (Twitter)',
          platform: CredentialPlatform.TWITTER,
          settings: expect.objectContaining({ replyPolicy: 'everyone' }),
        }),
      ]),
    );
  });

  it('records a target-specific blocker when media is unsupported', () => {
    const proposals = buildAgentPublishTargetProposals({
      caption: 'Launch video',
      credentials: [
        { id: 'cred-youtube', platform: CredentialPlatform.YOUTUBE },
        { id: 'cred-linkedin', platform: CredentialPlatform.LINKEDIN },
      ],
      defaultPlatforms: ['youtube', 'linkedin'],
      media: [{ id: 'ingredient-1', kind: 'image' }],
      publishMode: 'publish_now',
      visibility: PostVisibility.PUBLIC,
    });

    const youtube = proposals.find(
      (target) => target.platform === CredentialPlatform.YOUTUBE,
    );
    const linkedin = proposals.find(
      (target) => target.platform === CredentialPlatform.LINKEDIN,
    );

    expect(youtube?.blockers.map((blocker) => blocker.message)).toEqual(
      expect.arrayContaining(['YouTube does not support image media.']),
    );
    expect(linkedin?.blockers).toEqual([]);
  });

  it('parses confirmed target payloads and preserves one-target overrides', () => {
    const parsed = parseAgentPublishTargetPayloads([
      {
        caption: 'LinkedIn version',
        credentialId: 'cred-linkedin',
        platform: 'linkedin',
        settings: { visibility: 'PUBLIC' },
        visibility: PostVisibility.PUBLIC,
      },
      {
        caption: 'X version',
        credentialId: 'cred-twitter',
        platform: 'TWITTER',
        settings: { replyPolicy: 'mentioned' },
      },
      { platform: 'instagram' },
    ]);

    expect(parsed).toEqual([
      {
        caption: 'LinkedIn version',
        credentialId: 'cred-linkedin',
        platform: CredentialPlatform.LINKEDIN,
        settings: { visibility: 'PUBLIC' },
        visibility: PostVisibility.PUBLIC,
      },
      {
        caption: 'X version',
        credentialId: 'cred-twitter',
        platform: CredentialPlatform.TWITTER,
        settings: { replyPolicy: 'mentioned' },
        visibility: PostVisibility.PUBLIC,
      },
    ]);
  });

  it('blocks confirmation with an actionable target-specific reason', () => {
    const invalid = collectInvalidTargetBlockers({
      caption: 'x'.repeat(300),
      media: [{ id: 'ingredient-1', kind: 'image' }],
      publishMode: 'publish_now',
      targets: [
        {
          caption: 'x'.repeat(300),
          credentialId: 'cred-twitter',
          platform: CredentialPlatform.TWITTER,
        },
        {
          caption: 'LinkedIn still fits',
          credentialId: 'cred-linkedin',
          platform: CredentialPlatform.LINKEDIN,
        },
      ],
      visibility: PostVisibility.PUBLIC,
    });

    expect(invalid).toEqual([
      {
        label: 'X (Twitter)',
        messages: ['X (Twitter) captions must be 280 characters or fewer.'],
      },
    ]);
    expect(formatTargetBlockersError(invalid)).toContain(
      'X (Twitter): X (Twitter) captions must be 280 characters or fewer.',
    );
  });

  it('maps ingredient categories onto scheduler validation media', () => {
    expect(
      resolvePublishValidationMedia({ category: 'image' }, 'asset-1'),
    ).toEqual([{ id: 'asset-1', kind: 'image' }]);
    expect(
      resolvePublishValidationMedia({ category: 'GIF' }, 'asset-2'),
    ).toEqual([{ id: 'asset-2', isAnimated: true, kind: 'image' }]);
    expect(
      resolvePublishValidationMedia({ category: 'VIDEO_EDIT' }, 'asset-3'),
    ).toEqual([{ id: 'asset-3', kind: 'video' }]);
  });

  it('emits a canonical scheduler target payload with resolved settings', () => {
    expect(
      toCanonicalChannelTarget({
        caption: 'X-specific caption',
        credentialId: 'cred-twitter',
        order: 0,
        platform: CredentialPlatform.TWITTER,
        scheduledAt: '2026-07-18T09:00:00.000Z',
        settings: { replyPolicy: 'mentioned' },
        visibility: PostVisibility.PUBLIC,
      }),
    ).toEqual({
      caption: 'X-specific caption',
      credentialId: 'cred-twitter',
      order: 0,
      platform: CredentialPlatform.TWITTER,
      scheduledDate: '2026-07-18T09:00:00.000Z',
      settings: { replyPolicy: 'mentioned' },
      visibility: PostVisibility.PUBLIC,
    });
  });

  it('carries posting-signature attachments onto the scheduler target', () => {
    expect(
      toCanonicalChannelTarget({
        attachments: [
          {
            body: '— Genfeed',
            kind: 'signature',
            order: 0,
            platform: 'twitter',
          },
        ],
        credentialId: 'cred-twitter',
        order: 0,
        platform: CredentialPlatform.TWITTER,
        timezone: 'Europe/Malta',
        visibility: PostVisibility.PUBLIC,
      }),
    ).toEqual(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            body: '— Genfeed',
            kind: 'signature',
          }),
        ],
        timezone: 'Europe/Malta',
      }),
    );
  });
});
