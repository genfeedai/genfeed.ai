import type { ICredential } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { resolveAccountLabel } from './account-label.util';

function buildCredential(overrides: Partial<ICredential> = {}): ICredential {
  return {
    brandId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'credential-1',
    isDeleted: false,
    organizationId: null,
    platform: 'instagram' as ICredential['platform'],
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: null,
    ...overrides,
  };
}

describe('resolveAccountLabel', () => {
  it('prefers the operator label when present', () => {
    const credential = buildCredential({
      externalHandle: '@brand',
      label: 'Brand Instagram',
    });

    expect(resolveAccountLabel(credential, 'instagram')).toBe(
      'Brand Instagram',
    );
  });

  it('falls back to the external handle when there is no label', () => {
    const credential = buildCredential({ externalHandle: '@brand' });

    expect(resolveAccountLabel(credential, 'instagram')).toBe('@brand');
  });

  it('falls back to the external name when there is no handle', () => {
    const credential = buildCredential({ externalName: 'Brand Name' });

    expect(resolveAccountLabel(credential, 'instagram')).toBe('Brand Name');
  });

  it('falls back to the platform label when the credential is missing', () => {
    expect(resolveAccountLabel(undefined, 'instagram')).toBe('Instagram');
  });
});
