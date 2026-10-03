import type { MediaResourceProjection } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import {
  assetResponseIds,
  ingredientResponseIds,
  projectMediaResponse,
} from '@serializers/helpers/media-delivery-projection.helper';
import { IngredientSerializer } from '@serializers/server/ingredients/ingredient.serializer';
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
    expect(projected).not.toContain('original.png');
    expect(JSON.stringify(response)).toBe(snapshot);
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

  it('does not rewrite arbitrary strings or the authorized upload PUT capability', () => {
    const response = {
      prompt: 'https://provider.example/a?b#c%2F',
      uploadUrl: 'https://s3.example/put?signature=1',
    };
    expect(projectMediaResponse(response, [], false)).toEqual(response);
  });
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
