import {
  isJsonApiRelationshipReference,
  normalizeJsonApiRelationshipGraph,
  normalizeJsonApiRelationshipValue,
} from '@helpers/data/json-api/relationship.helper';
import { describe, expect, it } from 'vitest';

describe('relationship.helper', () => {
  it('normalizes bare JSON:API relationship linkage objects to string ids', () => {
    expect(normalizeJsonApiRelationshipValue({ id: 'org-42' })).toBe('org-42');
  });

  it('preserves string relationship ids', () => {
    expect(normalizeJsonApiRelationshipValue('org-42')).toBe('org-42');
  });

  it('accepts hydrated relationship objects as references when they expose an id', () => {
    expect(
      normalizeJsonApiRelationshipValue({
        id: 'org-42',
        label: 'Acme',
      }),
    ).toBe('org-42');
    expect(
      isJsonApiRelationshipReference({
        id: 'org-42',
        label: 'Acme',
      }),
    ).toBe(true);
  });

  it('returns undefined for missing relationship values', () => {
    expect(normalizeJsonApiRelationshipValue(undefined)).toBeUndefined();
    expect(normalizeJsonApiRelationshipValue(null)).toBeUndefined();
  });

  it('normalizes bare relationship linkage objects recursively across graphs', () => {
    expect(
      normalizeJsonApiRelationshipGraph({
        brand: { id: 'brand-42' },
        nested: {
          organization: { id: 'org-42' },
        },
        relationIds: [{ id: 'rel-1' }, { id: 'rel-2' }],
      }),
    ).toEqual({
      brand: 'brand-42',
      nested: {
        organization: 'org-42',
      },
      relationIds: ['rel-1', 'rel-2'],
    });
  });

  it('preserves hydrated objects when they contain more than an id', () => {
    expect(
      normalizeJsonApiRelationshipGraph({
        brand: {
          id: 'brand-42',
          label: 'Acme',
        },
      }),
    ).toEqual({
      brand: {
        id: 'brand-42',
        label: 'Acme',
      },
    });
  });
});
