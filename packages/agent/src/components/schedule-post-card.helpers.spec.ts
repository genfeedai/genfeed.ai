import { ReleaseAttachmentKind } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildSignatureAttachments,
  postingSetTargetsFromSelection,
  readAvailablePlatforms,
} from './schedule-post-card.helpers';

describe('schedule-post-card helpers', () => {
  it('builds signature attachments from selected ids', () => {
    expect(
      buildSignatureAttachments({
        platform: 'twitter',
        selectedIds: ['sig-1'],
        signatures: [
          {
            body: '— Genfeed',
            id: 'sig-1',
            isEnabled: true,
            label: 'Closer',
            organizationId: 'org-1',
            placement: 'append',
            platforms: ['twitter'],
            userId: 'user-1',
          },
        ],
      }),
    ).toEqual([
      {
        body: '— Genfeed',
        kind: ReleaseAttachmentKind.SIGNATURE,
        order: 0,
        platform: 'twitter',
      },
    ]);
  });

  it('turns the current target selection into a posting-set payload', () => {
    expect(
      postingSetTargetsFromSelection({
        targets: [
          {
            credentialId: 'cred-x',
            platform: 'twitter',
            signatureIds: ['sig-1'],
            timezone: 'Europe/Malta',
          },
        ],
      }),
    ).toEqual([
      {
        credentialId: 'cred-x',
        order: 0,
        platform: 'twitter',
        signatureIds: ['sig-1'],
        targetKey: 'twitter:cred-x',
        timezone: 'Europe/Malta',
      },
    ]);
  });

  it('does not fall back to a hardcoded platform list', () => {
    expect(readAvailablePlatforms(undefined, ['instagram'])).toEqual([
      'instagram',
    ]);
    expect(readAvailablePlatforms(['linkedin'], ['instagram'])).toEqual([
      'linkedin',
    ]);
  });
});
