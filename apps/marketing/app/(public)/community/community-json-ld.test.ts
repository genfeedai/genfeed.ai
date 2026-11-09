import type { Article } from '@models/content/article.model';
import type { Brand } from '@models/organization/brand.model';
import { describe, expect, it } from 'vitest';
import { buildCommunityJsonLd } from './community-json-ld';

describe('buildCommunityJsonLd', () => {
  it('lists every linked creator and article at its canonical URL', () => {
    const jsonLd = buildCommunityJsonLd({
      articles: [
        {
          brand: { slug: 'shayla' },
          label: 'Building in public',
          slug: 'building-in-public',
        } as Article,
        { label: 'Draft without a slug' } as Article,
      ],
      creators: [{ label: 'Shayla', slug: 'shayla' } as Brand],
    });

    expect(jsonLd).toMatchObject({
      '@type': 'CollectionPage',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          {
            '@type': 'ListItem',
            name: 'Shayla',
            position: 1,
            url: 'https://genfeed.ai/@shayla',
          },
          {
            '@type': 'ListItem',
            name: 'Building in public',
            position: 2,
            url: 'https://genfeed.ai/@shayla/articles/building-in-public',
          },
        ],
        numberOfItems: 2,
      },
      url: 'https://genfeed.ai/community',
    });
  });
});
