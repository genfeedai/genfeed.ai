import { describe, expect, it } from 'vitest';
import { StudioLook } from './studio-look.model';

describe('StudioLook', () => {
  it('constructs a client model from the serialized Look contract', () => {
    const look = new StudioLook({
      assetType: 'image',
      id: 'look-1',
      label: 'Editorial',
    });

    expect(look.id).toBe('look-1');
    expect(look.assetType).toBe('image');
    expect(look.label).toBe('Editorial');
  });
});
