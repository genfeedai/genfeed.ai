import { PublicBrandSerializer } from '@serializers/server/organizations/brand.serializer';
import { describe, expect, it } from 'vitest';

describe('PublicBrandSerializer', () => {
  it('serializes the profile fields and drops agent config, ownership and prompts', () => {
    const document = PublicBrandSerializer.serialize({
      agentConfig: {
        autoPublish: { isEnabled: true },
        persona: 'private persona',
        strategy: { competitors: ['a competitor'], offers: ['private offer'] },
        voice: { tone: 'private tone' },
      },
      backgroundColor: '#000000',
      bannerUrl: 'https://cdn.example.com/banner.png',
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      defaultVideoModel: 'private-model',
      description: 'Public description',
      externalId: 'external_1',
      fontFamily: 'MONTSERRAT_BLACK',
      id: 'brand_1',
      isFleetEnabled: true,
      isHighlighted: true,
      label: 'Public brand',
      logoUrl: 'https://cdn.example.com/logo.png',
      organization: { id: 'org_1', label: 'Private org' },
      organizationId: 'org_1',
      primaryColor: '#ffffff',
      scope: 'PUBLIC',
      secondaryColor: '#0f0f0f',
      slug: 'public-brand',
      text: 'You are creating content for the brand.',
      updatedAt: new Date('2026-08-05T01:00:00.000Z'),
      user: { email: 'private@example.com', id: 'user_1' },
      userId: 'user_1',
      watermarkText: 'private watermark',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        relationships?: Record<string, unknown>;
      };
      included?: unknown[];
    };

    expect(document.data.attributes).toMatchObject({
      backgroundColor: '#000000',
      bannerUrl: 'https://cdn.example.com/banner.png',
      description: 'Public description',
      fontFamily: 'MONTSERRAT_BLACK',
      isHighlighted: true,
      label: 'Public brand',
      logoUrl: 'https://cdn.example.com/logo.png',
      primaryColor: '#ffffff',
      secondaryColor: '#0f0f0f',
      slug: 'public-brand',
    });

    for (const privateKey of [
      'agentConfig',
      'defaultVideoModel',
      'externalId',
      'isFleetEnabled',
      'organization',
      'organizationId',
      'scope',
      'text',
      'user',
      'userId',
      'watermarkText',
    ]) {
      expect(document.data.attributes).not.toHaveProperty(privateKey);
    }

    expect(document.data.relationships).toBeUndefined();
    expect(document.included).toBeUndefined();
  });

  it('keeps the public links relationship', () => {
    const document = PublicBrandSerializer.serialize({
      id: 'brand_1',
      label: 'Public brand',
      links: [
        {
          brandId: 'brand_1',
          id: 'link_1',
          label: 'Site',
          url: 'https://x.dev',
        },
      ],
      slug: 'public-brand',
    }) as {
      data: { relationships?: Record<string, unknown> };
    };

    expect(document.data.relationships).toHaveProperty('links');
  });

  it('serializes the logo and banner with only the picture, never storage or ownership', () => {
    const document = PublicBrandSerializer.serialize({
      banner: {
        category: 'BANNER',
        cdnUrl: 'https://cdn.example.com/banners/asset_2?Signature=b',
        cloudObjectKey: 'banners/asset_2',
        id: 'asset_2',
        mimeType: 'image/png',
        parentOrgId: 'org_1',
        sha256: 'abc',
        userId: 'user_1',
      },
      id: 'brand_1',
      label: 'Public brand',
      logo: {
        category: 'LOGO',
        cdnUrl: 'https://cdn.example.com/logos/asset_1?Signature=a',
        cloudObjectKey: 'logos/asset_1',
        id: 'asset_1',
        mimeType: 'image/png',
        parentOrgId: 'org_1',
        sha256: 'def',
        userId: 'user_1',
      },
      slug: 'public-brand',
    }) as {
      included?: { attributes: Record<string, unknown>; id: string }[];
    };

    expect(
      document.included
        ?.map((asset) => ({ attributes: asset.attributes, id: asset.id }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual([
      {
        attributes: {
          category: 'LOGO',
          cdnUrl: 'https://cdn.example.com/logos/asset_1?Signature=a',
          mimeType: 'image/png',
        },
        id: 'asset_1',
      },
      {
        attributes: {
          category: 'BANNER',
          cdnUrl: 'https://cdn.example.com/banners/asset_2?Signature=b',
          mimeType: 'image/png',
        },
        id: 'asset_2',
      },
    ]);
  });
});
