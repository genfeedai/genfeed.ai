import { describe, expect, it } from 'vitest';
import { ContentHarnessRegistry, isContentHarnessPack } from '../src/registry';
import type { ContentHarnessPack } from '../src/types';

function buildPack(id: string): ContentHarnessPack {
  return {
    contribute: undefined,
    id,
    version: '1.0.0',
  };
}

describe('ContentHarnessRegistry', () => {
  it('registers and retrieves packs by id', () => {
    const registry = new ContentHarnessRegistry();
    const pack = buildPack('alpha');

    registry.registerPack(pack);

    expect(registry.get('alpha')).toBe(pack);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('replaces a pack registered under the same id', () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(buildPack('alpha'));
    const replacement = buildPack('alpha');
    registry.registerPack(replacement);

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('alpha')).toBe(replacement);
  });
});

describe('isContentHarnessPack', () => {
  it('rejects primitives and null', () => {
    expect(isContentHarnessPack(null)).toBe(false);
    expect(isContentHarnessPack(undefined)).toBe(false);
    expect(isContentHarnessPack('pack')).toBe(false);
    expect(isContentHarnessPack(42)).toBe(false);
  });

  it('rejects objects missing id or version', () => {
    expect(isContentHarnessPack({})).toBe(false);
    expect(isContentHarnessPack({ id: 'alpha' })).toBe(false);
    expect(isContentHarnessPack({ version: '1.0.0' })).toBe(false);
    expect(isContentHarnessPack({ id: 1, version: '1.0.0' })).toBe(false);
  });
});
