import type { IBrand } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { getBrandOrganizationId } from './brand-context.helpers';

describe('getBrandOrganizationId', () => {
  it('returns the nested organization id when present', () => {
    const brand = {
      organization: { id: 'org_123', slug: 'acme' },
    } as unknown as IBrand;

    expect(getBrandOrganizationId(brand)).toBe('org_123');
  });

  it('returns the nested organization _id when present', () => {
    const brand = {
      organization: { _id: 'org_456', slug: 'acme' },
    } as unknown as IBrand;

    expect(getBrandOrganizationId(brand)).toBe('org_456');
  });

  it('returns the organization when it is a raw id string', () => {
    const brand = { organization: 'org_789' } as unknown as IBrand;

    expect(getBrandOrganizationId(brand)).toBe('org_789');
  });

  it('falls back to the top-level organizationId when the bootstrap nests organization as { slug } only', () => {
    // Mirrors the protected-bootstrap payload shape, where the nested
    // organization is serialized as `{ slug }` and the id lives top-level.
    const brand = {
      organizationId: 'org_top',
      organization: { slug: 'acme' },
    } as unknown as IBrand;

    expect(getBrandOrganizationId(brand)).toBe('org_top');
  });

  it('returns an empty string when no organization id is resolvable', () => {
    const brand = { organization: { slug: 'acme' } } as unknown as IBrand;

    expect(getBrandOrganizationId(brand)).toBe('');
  });

  it('returns an empty string for nullish brands', () => {
    expect(getBrandOrganizationId(null)).toBe('');
    expect(getBrandOrganizationId(undefined)).toBe('');
  });
});
