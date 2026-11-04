import {
  isJsonApiRelationshipReference,
  normalizeJsonApiRelationshipGraph,
} from '@helpers/data/json-api/relationship.helper';
import { describe, expect, it } from 'vitest';

describe('relationship.helper', () => {
  it('accepts hydrated relationship objects as references when they expose an id', () => {
    expect(
      isJsonApiRelationshipReference({
        id: 'org-42',
        label: 'Acme',
      }),
    ).toBe(true);
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
