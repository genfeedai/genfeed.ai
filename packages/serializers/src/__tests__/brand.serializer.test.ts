import { describe, expect, it } from 'vitest';
import { BrandSerializer } from '../server/organizations/brand.serializer';

describe('brand serializer', () => {
  it('sends every logo variant and platform image to the app', () => {
    const serialized = BrandSerializer.serialize({
      banner: { cdnUrl: 'https://cdn.test/master', id: 'master' },
      banners: [
        { cdnUrl: 'https://cdn.test/master', id: 'master' },
        { cdnUrl: 'https://cdn.test/x-header', id: 'x-header' },
      ],
      id: 'brand-1',
      label: 'Brand',
      logo: { cdnUrl: 'https://cdn.test/primary', id: 'primary' },
      logos: [
        { cdnUrl: 'https://cdn.test/primary', id: 'primary' },
        { cdnUrl: 'https://cdn.test/icon', id: 'icon' },
      ],
    });

    expect(serialized.data.relationships).toMatchObject({
      banners: {
        data: [
          { id: 'master', type: 'banners' },
          { id: 'x-header', type: 'banners' },
        ],
      },
      logos: {
        data: [
          { id: 'primary', type: 'logos' },
          { id: 'icon', type: 'logos' },
        ],
      },
    });
    expect(serialized.included).toContainEqual({
      attributes: { cdnUrl: 'https://cdn.test/icon' },
      id: 'icon',
      type: 'logos',
    });
  });
});
