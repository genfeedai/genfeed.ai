import { metadata } from '@helpers/media/metadata/metadata.helper';
import { describe, expect, it } from 'vitest';

describe('metadata', () => {
  it('has a non-empty name', () => {
    expect(typeof metadata.name).toBe('string');
    expect(metadata.name.length).toBeGreaterThan(0);
  });

  it('has a non-empty description', () => {
    expect(typeof metadata.description).toBe('string');
    expect(metadata.description.length).toBeGreaterThan(0);
  });

  it('has a keywords array with at least one entry', () => {
    expect(Array.isArray(metadata.keywords)).toBe(true);
    expect(metadata.keywords.length).toBeGreaterThan(0);
  });
});
