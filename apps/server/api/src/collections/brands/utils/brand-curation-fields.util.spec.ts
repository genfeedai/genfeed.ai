import { withoutCuration } from '@api/collections/brands/utils/brand-curation-fields.util';
import { describe, expect, it } from 'vitest';

describe('withoutCuration', () => {
  it.each([
    [{ isHighlighted: true, label: 'Acme' }, { label: 'Acme' }],
    [{ label: 'Acme' }, { label: 'Acme' }],
  ])('%j keeps only member fields', (dto, expected) => {
    expect(withoutCuration(dto)).toEqual(expected);
  });
});
