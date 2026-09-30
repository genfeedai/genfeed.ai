import { CredentialPlatform } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  type PreviewAuthorScope,
  resolvePreviewAuthor,
} from './preview-author';

function credential(overrides: Partial<ICredential> = {}): ICredential {
  return {
    id: 'account-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    isDeleted: false,
    isConnected: true,
    platform: CredentialPlatform.TWITTER,
    externalName: 'Vincent',
    externalHandle: 'vincent',
    externalAvatar: 'https://example.com/avatar.jpg',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
function scope(credentials: ICredential[] = []): PreviewAuthorScope {
  return {
    brandId: 'brand-1',
    organizationId: 'org-1',
    selectedBrand: {
      id: 'brand-1',
      organizationId: 'org-1',
      label: 'Genfeed',
      logoUrl: 'https://example.com/logo.jpg',
    },
    credentials,
  };
}

describe('resolvePreviewAuthor', () => {
  it('uses the sole connected account for platform aliases', () => {
    expect(
      resolvePreviewAuthor(scope([credential()]), { platform: 'x' }),
    ).toEqual({
      name: 'Vincent',
      handle: 'vincent',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
  });
  it('uses the brand rather than arbitrarily selecting among multiple accounts', () => {
    expect(
      resolvePreviewAuthor(
        scope([credential(), credential({ id: 'account-2' })]),
        { platform: 'twitter' },
      ),
    ).toEqual({
      name: 'Genfeed',
      handle: undefined,
      avatarUrl: 'https://example.com/logo.jpg',
    });
  });
  it('uses the explicit account even when multiple accounts are connected', () => {
    expect(
      resolvePreviewAuthor(
        scope([
          credential(),
          credential({ id: 'account-2', externalName: 'Second' }),
        ]),
        { platform: 'twitter', credentialId: 'account-2' },
      )?.name,
    ).toBe('Second');
  });
  it('excludes disconnected, deleted and foreign-scope credentials', () => {
    for (const overrides of [
      { isConnected: false },
      { isDeleted: true },
      { brandId: 'other' },
      { organizationId: 'other' },
    ]) {
      expect(
        resolvePreviewAuthor(scope([credential(overrides)]), {
          platform: 'twitter',
        })?.name,
      ).toBe('Genfeed');
    }
  });
  it('does not substitute a different account when an explicit account is unavailable', () => {
    expect(
      resolvePreviewAuthor(scope([credential()]), {
        platform: 'twitter',
        credentialId: 'missing',
      })?.name,
    ).toBe('Genfeed');
  });
  it('never renders current brand identity on an artifact explicitly owned by another brand', () => {
    expect(
      resolvePreviewAuthor(scope([credential()]), {
        platform: 'twitter',
        brandId: 'other-brand',
      }),
    ).toBeUndefined();
  });
  it('falls back to the brand logo when a connected account has no avatar', () => {
    expect(
      resolvePreviewAuthor(scope([credential({ externalAvatar: null })]), {
        platform: 'twitter',
      })?.avatarUrl,
    ).toBe('https://example.com/logo.jpg');
  });
  it('does not render a stale selected brand after scope changes', () => {
    const state = scope();
    state.brandId = 'brand-2';
    expect(
      resolvePreviewAuthor(state, { platform: 'twitter' }),
    ).toBeUndefined();
  });
});
