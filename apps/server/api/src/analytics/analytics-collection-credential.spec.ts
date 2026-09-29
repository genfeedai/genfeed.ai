import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type AnalyticsCollectionCredentialLookup,
  resolveAnalyticsCollectionCredential,
} from './analytics-collection-credential';

function lookup(options: {
  connected?: Array<{ id: string }>;
  named?: {
    brandId: string;
    id: string;
    organizationId: string;
    platform: 'INSTAGRAM' | 'TIKTOK';
  } | null;
}): AnalyticsCollectionCredentialLookup {
  return {
    findConnectedAccounts: vi.fn().mockResolvedValue(options.connected ?? []),
    findOne: vi.fn().mockResolvedValue(options.named ?? null),
  };
}

describe('resolveAnalyticsCollectionCredential', () => {
  it('fails closed when the named credential belongs to a sibling brand', async () => {
    const result = await resolveAnalyticsCollectionCredential({
      brandId: 'brand-1',
      credentialId: 'cred-2',
      lookup: lookup({
        named: {
          brandId: 'brand-2',
          id: 'cred-2',
          organizationId: 'org-1',
          platform: 'INSTAGRAM',
        },
      }),
      organizationId: 'org-1',
      platform: CredentialPlatform.INSTAGRAM,
    });

    expect(result).toEqual({ kind: 'mismatch' });
  });

  it('does not pick a sibling when multiple connected accounts exist', async () => {
    const result = await resolveAnalyticsCollectionCredential({
      brandId: 'brand-1',
      lookup: lookup({
        connected: [{ id: 'cred-a' }, { id: 'cred-b' }],
      }),
      organizationId: 'org-1',
      platform: CredentialPlatform.INSTAGRAM,
    });

    expect(result).toEqual({ kind: 'ambiguous' });
  });

  it('reports missing when no connected account exists', async () => {
    const result = await resolveAnalyticsCollectionCredential({
      brandId: 'brand-1',
      lookup: lookup({ connected: [] }),
      organizationId: 'org-1',
      platform: CredentialPlatform.INSTAGRAM,
    });

    expect(result).toEqual({ kind: 'missing' });
  });
});
