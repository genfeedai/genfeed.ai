import {
  expandPostingSetTargets,
  postingSetSchema,
  postingSignatureSchema,
  renderContentWithPostingSignatures,
} from '@api-types/contracts/posting-sets.contract';
import { CredentialPlatform, ReleaseAttachmentKind } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

const twitterSignature = {
  body: 'Built with Genfeed.',
  id: 'sig-twitter',
  label: 'X footer',
  platforms: [CredentialPlatform.TWITTER],
} as const;

const linkedinSignature = {
  body: 'Follow Genfeed for more launch notes.',
  id: 'sig-linkedin',
  label: 'LinkedIn footer',
  platforms: [CredentialPlatform.LINKEDIN],
} as const;

describe('posting set schemas', () => {
  test('accepts reusable targets with signature references', () => {
    const result = postingSetSchema.safeParse({
      brandId: 'brand_123',
      label: 'Launch channels',
      targets: [
        {
          credentialId: 'cred_x',
          platform: CredentialPlatform.TWITTER,
          settings: { replyControl: 'everyone' },
          signatureIds: ['sig-twitter'],
          targetKey: 'x-primary',
        },
        {
          credentialId: 'cred_li',
          platform: CredentialPlatform.LINKEDIN,
          signatureIds: ['sig-linkedin'],
          targetKey: 'linkedin-page',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test('rejects a signature without platform applicability', () => {
    const result = postingSignatureSchema.safeParse({
      body: 'Missing platform',
      id: 'sig-empty',
      label: 'Empty',
      platforms: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('expandPostingSetTargets', () => {
  test('expands a posting set into ordinary scheduler targets', () => {
    const targets = expandPostingSetTargets({
      postingSet: {
        label: 'Launch channels',
        targets: [
          {
            credentialId: 'cred_x',
            platform: CredentialPlatform.TWITTER,
            settings: { replyControl: 'everyone' },
            signatureIds: ['sig-twitter', 'sig-linkedin'],
            targetKey: 'x-primary',
          },
        ],
      },
      scheduledDate: '2026-08-12T10:00:00.000Z',
      signatures: [twitterSignature, linkedinSignature],
      timezone: 'Europe/Malta',
    });

    expect(targets).toEqual([
      {
        attachments: [
          {
            body: 'Built with Genfeed.',
            kind: ReleaseAttachmentKind.SIGNATURE,
            order: 0,
            platform: CredentialPlatform.TWITTER,
          },
        ],
        credentialId: 'cred_x',
        order: 0,
        platform: CredentialPlatform.TWITTER,
        scheduledDate: '2026-08-12T10:00:00.000Z',
        settings: { replyControl: 'everyone' },
        timezone: 'Europe/Malta',
      },
    ]);
  });

  test('lets target overrides replace defaults and exclude signatures', () => {
    const targets = expandPostingSetTargets({
      overrides: [
        {
          excludedSignatureIds: ['sig-twitter'],
          settings: { replyControl: 'mentioned_users' },
          targetKey: 'x-primary',
        },
      ],
      postingSet: {
        label: 'Launch channels',
        targets: [
          {
            credentialId: 'cred_x',
            platform: CredentialPlatform.TWITTER,
            settings: { replyControl: 'everyone' },
            signatureIds: ['sig-twitter'],
            targetKey: 'x-primary',
          },
        ],
      },
      signatures: [twitterSignature],
    });

    expect(targets[0]).toEqual({
      credentialId: 'cred_x',
      order: 0,
      platform: CredentialPlatform.TWITTER,
      settings: { replyControl: 'mentioned_users' },
    });
  });

  test('preserves explicit attachment overrides after resolved signatures', () => {
    const targets = expandPostingSetTargets({
      overrides: [
        {
          attachments: [
            {
              body: 'First comment',
              kind: ReleaseAttachmentKind.COMMENT,
            },
          ],
          targetKey: 'x-primary',
        },
      ],
      postingSet: {
        label: 'Launch channels',
        targets: [
          {
            credentialId: 'cred_x',
            platform: CredentialPlatform.TWITTER,
            signatureIds: ['sig-twitter'],
            targetKey: 'x-primary',
          },
        ],
      },
      signatures: [twitterSignature],
    });

    expect(targets[0]?.attachments).toEqual([
      {
        body: 'Built with Genfeed.',
        kind: ReleaseAttachmentKind.SIGNATURE,
        order: 0,
        platform: CredentialPlatform.TWITTER,
      },
      {
        body: 'First comment',
        kind: ReleaseAttachmentKind.COMMENT,
      },
    ]);
  });
});

describe('renderContentWithPostingSignatures', () => {
  test('renders platform-scoped signatures around content', () => {
    const content = renderContentWithPostingSignatures({
      content: 'Launch day is here.',
      platform: CredentialPlatform.LINKEDIN,
      signatureIds: ['sig-prefix', 'sig-linkedin', 'sig-twitter'],
      signatures: [
        {
          body: 'From the Genfeed team',
          id: 'sig-prefix',
          label: 'LinkedIn opener',
          placement: 'prepend',
          platforms: [CredentialPlatform.LINKEDIN],
        },
        linkedinSignature,
        twitterSignature,
      ],
    });

    expect(content).toBe(
      [
        'From the Genfeed team',
        'Launch day is here.',
        'Follow Genfeed for more launch notes.',
      ].join('\n\n'),
    );
  });

  test('supports per-target signature body overrides', () => {
    const content = renderContentWithPostingSignatures({
      content: 'Shipping notes.',
      platform: CredentialPlatform.TWITTER,
      signatureBodyOverrides: {
        'sig-twitter': 'Custom footer.',
      },
      signatureIds: ['sig-twitter'],
      signatures: [twitterSignature],
    });

    expect(content).toBe('Shipping notes.\n\nCustom footer.');
  });
});
