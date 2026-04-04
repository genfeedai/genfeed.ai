import { describe, expect, it } from 'vitest';

import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from './generation-defaults.util';

describe('resolveGenerationDefaultModel', () => {
  it('returns explicit model when provided', () => {
    const result = resolveGenerationDefaultModel({
      brandDefault: 'brand-model',
      explicit: 'explicit-model',
      organizationDefault: 'org-model',
      systemDefault: 'system-model',
    });
    expect(result).toBe('explicit-model');
  });

  it('falls back to brandDefault when explicit is null', () => {
    const result = resolveGenerationDefaultModel({
      brandDefault: 'brand-model',
      explicit: null,
      organizationDefault: 'org-model',
      systemDefault: 'system-model',
    });
    expect(result).toBe('brand-model');
  });

  it('falls back to organizationDefault when explicit and brandDefault are null', () => {
    const result = resolveGenerationDefaultModel({
      brandDefault: null,
      explicit: null,
      organizationDefault: 'org-model',
      systemDefault: 'system-model',
    });
    expect(result).toBe('org-model');
  });

  it('falls back to systemDefault when all others are null', () => {
    const result = resolveGenerationDefaultModel({
      brandDefault: null,
      explicit: null,
      organizationDefault: null,
      systemDefault: 'system-model',
    });
    expect(result).toBe('system-model');
  });

  it('falls back to systemDefault when explicit is undefined', () => {
    const result = resolveGenerationDefaultModel({
      systemDefault: 'system-model',
    });
    expect(result).toBe('system-model');
  });

  it('uses explicit over brandDefault even when both defined', () => {
    const result = resolveGenerationDefaultModel({
      brandDefault: 'brand',
      explicit: 'overridden',
      systemDefault: 'system',
    });
    expect(result).toBe('overridden');
  });
});

describe('isImageToVideoRequest', () => {
  it('returns true when endFrame is provided', () => {
    expect(isImageToVideoRequest({ endFrame: 'frame-url' })).toBe(true);
  });

  it('returns true when references array has items', () => {
    expect(isImageToVideoRequest({ references: ['ref1'] })).toBe(true);
  });

  it('returns true when both endFrame and references are provided', () => {
    expect(
      isImageToVideoRequest({ endFrame: 'frame', references: ['ref'] }),
    ).toBe(true);
  });

  it('returns false when endFrame is null and references is empty', () => {
    expect(isImageToVideoRequest({ endFrame: null, references: [] })).toBe(
      false,
    );
  });

  it('returns false when endFrame is null and references is null', () => {
    expect(isImageToVideoRequest({ endFrame: null, references: null })).toBe(
      false,
    );
  });

  it('returns false with no params', () => {
    expect(isImageToVideoRequest({})).toBe(false);
  });

  it('returns false when references contains only null/undefined values (length truthy)', () => {
    // Array has items (nulls), so length > 0 → true
    expect(isImageToVideoRequest({ references: [null, undefined] })).toBe(true);
  });
});
