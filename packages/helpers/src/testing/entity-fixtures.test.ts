import { describe, expect, it } from 'vitest';
import {
  createBrand,
  createOrganization,
  createTagFixture,
} from './entity-fixtures';

describe('createTagFixture', () => {
  it('exposes the default brand and organization as scalar owner ids', () => {
    const tag = createTagFixture();

    expect(tag.brandId).toBe(tag.brand.id);
    expect(tag.organizationId).toBe(tag.organization.id);
  });

  it('follows a requested brand and organization', () => {
    const brand = createBrand({ id: 'brand-other' });
    const organization = createOrganization({ id: 'org-other' });

    const tag = createTagFixture({ brand, organization });

    expect(tag.brandId).toBe('brand-other');
    expect(tag.organizationId).toBe('org-other');
  });

  it('keeps an explicitly requested global scope', () => {
    const tag = createTagFixture({ brandId: null, organizationId: null });

    expect(tag.brandId).toBeNull();
    expect(tag.organizationId).toBeNull();
  });
});
