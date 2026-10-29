import type { MediaResourceProjection } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import {
  assetResponseIds,
  ingredientResponseIds,
  projectMediaResponse,
  projectSocialAvatarUrls,
} from '@serializers/helpers/media-delivery-projection.helper';
import { PostSerializer } from '@serializers/server/content/post.serializer';
import { IngredientSerializer } from '@serializers/server/ingredients/ingredient.serializer';
import { CredentialSerializer } from '@serializers/server/organizations/credential.serializer';
import { describe, expect, it } from 'vitest';

const id = testId('ingredient', 1);
const metadataId = testId('metadata', 1);
const assetId = testId('asset', 1);
const preview: MediaResourceProjection = {
  ingredientId: id,
  metadataId,
  grant: {
    id,
    purpose: 'preview',
    state: 'READY',
    expiresAt: null,
    url: 'https://cdn.example/protected-preview.png',
  },
};

describe('media delivery response projection', () => {
  it('uses real ingredient serialization, removes original alternatives and keeps the cached input intact', () => {
    const response = IngredientSerializer.serialize({
      id,
      category: 'IMAGE',
      cdnUrl: 'https://cdn.example/original.png',
      s3Key: 'ingredients/images/original.png',
      generationHarness: {
        providerUrl: 'https://provider.example/original.png',
        isEnhancementFailed: true,
      },
      metadata: {
        id: metadataId,
        label: 'Photo',
        result: 'https://provider.example/original.png',
      },
    });
    const snapshot = JSON.stringify(response);
    expect(ingredientResponseIds(response)).toEqual([id]);
    const projected = JSON.stringify(
      projectMediaResponse(response, [preview], false),
    );
    expect(projected).toContain('protected-preview');
    expect(projected).toContain('"isEnhancementFailed":true');
    expect(projected).toContain('"generationHarness":null');
    expect(projected).not.toContain('original.png');
    expect(JSON.stringify(response)).toBe(snapshot);
  });

  it('projects a grant onto every ingredient included with a serialized post', () => {
    const secondId = testId('ingredient', 2);
    const response = PostSerializer.serialize({
      id: testId('post', 1),
      ingredients: [secondId, id].map((ingredientId) => ({
        id: ingredientId,
        category: 'IMAGE',
        cdnUrl: `https://cdn.example/${ingredientId}-original.png`,
        s3Key: `ingredients/images/${ingredientId}`,
        metadata: { id: testId('metadata', 9), label: 'Photo' },
      })),
    });
    expect(ingredientResponseIds(response).sort()).toEqual(
      [id, secondId].sort(),
    );
    const projected = JSON.stringify(
      projectMediaResponse(response, [preview], false),
    );
    // Every ingredient carries a delivery grant: READY for the authorized
    // one, an explicit UNSUPPORTED for the other. None keeps an original URL,
    // so the client never falls back to the unsigned route.
    expect(projected.match(/"mediaDelivery"/g)).toHaveLength(2);
    expect(projected).toContain('protected-preview');
    expect(projected).toContain('UNSUPPORTED');
    expect(projected).not.toContain('original.png');
    expect(projected).not.toContain('ingredients/images/');
  });

  it('covers nested persona ingredient url fields and omits foreign/deleted projections', () => {
    const response = {
      data: { type: 'persona', id: testId('persona', 1), attributes: {} },
      included: [
        {
          type: 'ingredient',
          id,
          attributes: {
            url: 'https://cdn.example/original.png',
            thumbnailUrl: 'https://cdn.example/original.png',
          },
        },
      ],
    };
    const projected = JSON.stringify(projectMediaResponse(response, [], false));
    expect(projected).not.toContain('original.png');
    expect(projected).toContain('UNSUPPORTED');
  });

  it('covers raw agent media envelopes and raw bootstrap/import asset contracts', () => {
    const response = {
      agent: { ingredientId: id, url: 'https://cdn.example/original.png' },
      brands: [
        {
          id: testId('brand', 1),
          slug: 'test',
          logo: {
            id: assetId,
            category: 'LOGO',
            cdnUrl: 'https://cdn.example/logo-original.png',
          },
        },
      ],
      imported: { assetId, url: 'https://cdn.example/logo-original.png' },
    };
    expect(ingredientResponseIds(response)).toEqual([id]);
    expect(assetResponseIds(response)).toEqual([assetId]);
    expect(
      JSON.stringify(projectMediaResponse(response, [preview], false)),
    ).not.toContain('original.png');
    const paid = JSON.stringify(
      projectMediaResponse(response, [preview], true, [
        { assetId, url: 'https://cdn.example/authorized-logo.png' },
      ]),
    );
    expect(paid).toContain('authorized-logo');
    expect(paid).not.toContain('logo-original');
  });

  it('keeps the brand logo for plans without clean access but withholds references', () => {
    const response = {
      brands: [
        {
          id: testId('brand', 1),
          slug: 'test',
          logo: {
            id: assetId,
            category: 'LOGO',
            cdnUrl: 'https://cdn.example/logo-original.png',
          },
          references: [{ id: 'ref-1', cdnUrl: 'https://cdn.example/ref.png' }],
        },
      ],
    };
    const [brand] = (
      projectMediaResponse(response, [], false, [
        { assetId, url: 'https://cdn.example/authorized-logo.png' },
      ]) as { brands: Record<string, unknown>[] }
    ).brands;
    expect(brand.logo).toMatchObject({
      cdnUrl: 'https://cdn.example/authorized-logo.png',
    });
    expect(brand.logoUrl).toBe('https://cdn.example/authorized-logo.png');
    expect(brand.references).toBeNull();
  });

  it('signs a brand logo and banner serialized as included JSON:API resources', () => {
    const bannerId = testId('asset', 2);
    const response = {
      data: {
        id: testId('brand', 1),
        attributes: { slug: 'test' },
        type: 'brand',
      },
      included: [
        {
          id: assetId,
          attributes: {
            category: 'LOGO',
            cdnUrl: 'https://cdn.example/logos/unsigned',
          },
          type: 'logo',
        },
        {
          id: bannerId,
          attributes: {
            category: 'BANNER',
            cdnUrl: 'https://cdn.example/banners/unsigned',
          },
          type: 'banner',
        },
      ],
    };
    expect(assetResponseIds(response)).toEqual([assetId, bannerId]);

    const projected = projectMediaResponse(response, [], true, [
      { assetId, url: 'https://cdn.example/logos/unsigned?Signature=a' },
    ]) as {
      included: { attributes: Record<string, unknown> }[];
    };

    expect(projected.included[0].attributes.cdnUrl).toBe(
      'https://cdn.example/logos/unsigned?Signature=a',
    );
    // An asset the caller cannot see is withheld instead of left unsigned.
    expect(projected.included[1].attributes.cdnUrl).toBeNull();
  });

  it('does not rewrite arbitrary strings or the authorized upload PUT capability', () => {
    const response = {
      prompt: 'https://provider.example/a?b#c%2F',
      uploadUrl: 'https://s3.example/put?signature=1',
    };
    expect(projectMediaResponse(response, [], false)).toEqual(response);
  });
});

it('projects rows that reference an ingredient (editor clips, analytics top content)', () => {
  const rows = {
    clips: [
      {
        id: 'clip-1',
        ingredientId: id,
        ingredientUrl: 'https://cdn.example/ingredients/videos/x',
      },
    ],
    top: [
      {
        id: 'row-1',
        ingredientId: id,
        ingredientUrl: 'https://cdn.example/ingredients/videos/x',
        isVideo: true,
        thumbnailUrl: 'https://cdn.example/ingredients/thumbnails/x',
      },
      {
        id: 'row-2',
        ingredientId: id,
        ingredientUrl: 'https://cdn.example/ingredients/images/x',
        isVideo: false,
        thumbnailUrl: 'https://cdn.example/ingredients/images/x',
      },
    ],
  };
  expect(ingredientResponseIds(rows)).toEqual([id]);
  const projected = projectMediaResponse(rows, [preview], true) as typeof rows;
  expect(projected.clips[0].ingredientUrl).toBe(preview.grant.url);
  expect(projected.top[0].ingredientUrl).toBe(preview.grant.url);
  expect(projected.top[0].thumbnailUrl).toBeNull();
  expect(projected.top[1].thumbnailUrl).toBe(preview.grant.url);
  expect(JSON.stringify(projected)).not.toContain('/ingredients/');
  const unauthorized = projectMediaResponse(rows, [], true) as typeof rows;
  expect(unauthorized.clips[0].ingredientUrl).toBeNull();
});

it('projects typed agent tool data and preview-card media arrays by canonical ingredient identity', () => {
  const response = {
    data: { id, status: 'GENERATED', url: 'https://provider.test/original' },
    nextActions: [
      {
        type: 'content_preview_card',
        assetKind: 'image',
        assetId: id,
        images: ['https://provider.test/original'],
      },
    ],
  };
  expect(ingredientResponseIds(response)).toEqual([id]);
  expect(
    JSON.stringify(projectMediaResponse(response, [preview], false)),
  ).not.toContain('provider.test');
});

it('preserves binary streams and non-plain values without walking their internals', () => {
  class BinaryResponse {
    self: BinaryResponse = this;
  }
  const stream = new BinaryResponse();
  const date = new Date('2026-10-03T00:00:00Z');
  const buffer = Buffer.from('media');
  expect(ingredientResponseIds(stream)).toEqual([]);
  expect(projectMediaResponse(stream, [], false)).toBe(stream);
  const projected = projectMediaResponse({ date, buffer }, [], false) as {
    date: Date;
    buffer: Buffer;
  };
  expect(projected.date).toBe(date);
  expect(projected.buffer).toBe(buffer);
});

describe('social avatar projection', () => {
  const avatar = 'https://cdn.example/ingredients/social-avatars/cred-1';
  const sign = (url: string) => `${url}?Signature=abc`;

  it('re-signs the avatar of a serialized credential without mutating the input', () => {
    const response = CredentialSerializer.serialize({
      id: 'cred-1',
      platform: 'INSTAGRAM',
      externalAvatar: avatar,
    });
    const serialized = JSON.stringify(response);
    const projected = projectSocialAvatarUrls(response, sign);
    expect(JSON.stringify(projected)).toContain(`${avatar}?Signature=abc`);
    expect(JSON.stringify(response)).toBe(serialized);
  });

  it('signs avatars nested in lists and relations, and only on the avatar prefix', () => {
    const other = 'https://cdn.example/ingredients/images/img-1';
    const provider = 'https://pbs.twimg.com/profile_images/1/a.jpg';
    expect(
      projectSocialAvatarUrls(
        { accounts: [{ externalAvatar: avatar }], other, provider },
        sign,
      ),
    ).toEqual({
      accounts: [{ externalAvatar: `${avatar}?Signature=abc` }],
      other,
      provider,
    });
  });

  it('withholds an avatar that cannot be signed instead of returning the unsigned link', () => {
    expect(
      projectSocialAvatarUrls({ externalAvatar: avatar }, () => {
        throw new Error('no key');
      }),
    ).toEqual({ externalAvatar: null });
  });

  it('returns the same reference when nothing needs signing', () => {
    const response = { data: [{ id: 'a', externalAvatar: null }] };
    expect(projectSocialAvatarUrls(response, sign)).toBe(response);
  });
});
