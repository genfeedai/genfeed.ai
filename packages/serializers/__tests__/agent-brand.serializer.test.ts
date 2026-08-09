import {
  serializeAgentBrand,
  serializeAgentBrands,
} from '@serializers/server/threads/agent-brand.serializer';
import { describe, expect, it } from 'vitest';

describe('serializeAgentBrand', () => {
  it('serializes a fully populated brand record', () => {
    expect(
      serializeAgentBrand({
        description: 'Streetwear label',
        id: 'brand-1',
        isActive: true,
        isDeleted: false,
        label: 'Acme Street',
        name: 'Acme',
        secretInternalColumn: 'must-not-leak',
        slug: 'acme',
        text: 'Bold voice',
      }),
    ).toEqual({
      description: 'Streetwear label',
      id: 'brand-1',
      isActive: true,
      label: 'Acme Street',
      name: 'Acme',
      slug: 'acme',
      text: 'Bold voice',
    });
  });

  it('falls back label to name and name to label', () => {
    expect(serializeAgentBrand({ id: 'brand-2', name: 'Acme' })).toMatchObject({
      label: 'Acme',
      name: 'Acme',
    });
    expect(
      serializeAgentBrand({ id: 'brand-3', label: 'Acme Street' }),
    ).toMatchObject({
      label: 'Acme Street',
      name: 'Acme Street',
    });
  });

  it('coerces missing fields to empty strings and false', () => {
    expect(serializeAgentBrand({})).toEqual({
      description: '',
      id: '',
      isActive: false,
      label: '',
      name: '',
      slug: '',
      text: '',
    });
  });
});

describe('serializeAgentBrands', () => {
  it('serializes each record in the collection', () => {
    const result = serializeAgentBrands([
      { id: 'brand-1', label: 'One', slug: 'one' },
      { id: 'brand-2', name: 'Two', slug: 'two' },
    ]);

    expect(result).toEqual([
      {
        description: '',
        id: 'brand-1',
        isActive: false,
        label: 'One',
        name: 'One',
        slug: 'one',
        text: '',
      },
      {
        description: '',
        id: 'brand-2',
        isActive: false,
        label: 'Two',
        name: 'Two',
        slug: 'two',
        text: '',
      },
    ]);
  });

  it('returns an empty array for an empty collection', () => {
    expect(serializeAgentBrands([])).toEqual([]);
  });
});
