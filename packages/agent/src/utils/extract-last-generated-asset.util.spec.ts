import { describe, expect, it } from 'vitest';
import {
  extractLastGeneratedAssetFromMessages,
  extractLastGeneratedAssetFromMetadata,
  resolveLastGeneratedAsset,
} from './extract-last-generated-asset.util';

describe('extractLastGeneratedAssetFromMetadata', () => {
  it('uses an ingredient thumbnail when the generated file is video', () => {
    expect(
      extractLastGeneratedAssetFromMetadata({
        uiActions: [
          {
            id: 'action-2',
            ingredients: [
              {
                id: 'ing-1',
                thumbnailUrl: 'https://cdn.test/poster.jpg',
                type: 'video',
                url: 'https://cdn.test/clip.mp4',
              },
            ],
            title: 'Clip',
            type: 'batch_generation_result_card',
          },
        ],
      }),
    ).toEqual({
      kind: 'video',
      url: 'https://cdn.test/poster.jpg',
    });
  });
});

describe('extractLastGeneratedAssetFromMessages', () => {
  it('walks messages from the end so the latest generated output wins', () => {
    expect(
      extractLastGeneratedAssetFromMessages([
        {
          metadata: {
            uiActions: [
              {
                id: 'older',
                images: ['https://cdn.test/older.png'],
                title: 'Older',
                type: 'content_preview_card',
              },
            ],
          },
        },
        {
          metadata: {
            uiActions: [
              {
                id: 'newer',
                images: ['https://cdn.test/newer.png'],
                title: 'Newer',
                type: 'content_preview_card',
              },
            ],
          },
        },
      ]),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/newer.png',
    });
  });
});

describe('resolveLastGeneratedAsset', () => {
  it('keeps a stored ingredient when a later assistant turn has no media', () => {
    expect(
      resolveLastGeneratedAsset({
        ingredient: {
          createdAt: '2026-08-01T10:00:00.000Z',
          kind: 'image',
          url: 'https://cdn.test/ingredient.png',
        },
        metadata: { uiActions: [] },
        metadataCreatedAt: '2026-08-02T10:00:00.000Z',
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/ingredient.png',
    });
  });

  it('treats equivalent fractional timestamp precision as the same instant', () => {
    expect(
      resolveLastGeneratedAsset({
        ingredient: {
          createdAt: '2026-08-02T10:00:00.1Z',
          kind: 'image',
          url: 'https://cdn.test/ingredient.png',
        },
        metadata: {
          mediaUrl: 'https://cdn.test/metadata.png',
        },
        metadataCreatedAt: '2026-08-02T10:00:00.10Z',
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/metadata.png',
    });
  });

  it.each([
    {
      ingredientCreatedAt: 'invalid-ingredient-date',
      metadataCreatedAt: '2026-08-02T10:00:00.000Z',
    },
    {
      ingredientCreatedAt: '2026-08-02T10:00:00.000Z',
      metadataCreatedAt: 'invalid-metadata-date',
    },
  ])(
    'keeps the metadata fallback when a candidate timestamp is invalid',
    ({ ingredientCreatedAt, metadataCreatedAt }) => {
      expect(
        resolveLastGeneratedAsset({
          ingredient: {
            createdAt: ingredientCreatedAt,
            kind: 'image',
            url: 'https://cdn.test/ingredient.png',
          },
          metadata: {
            mediaUrl: 'https://cdn.test/metadata.png',
          },
          metadataCreatedAt,
        }),
      ).toEqual({
        kind: 'image',
        url: 'https://cdn.test/metadata.png',
      });
    },
  );

  it('keeps the metadata fallback when a candidate timestamp is missing', () => {
    expect(
      resolveLastGeneratedAsset({
        ingredient: {
          createdAt: '2026-08-02T10:00:00.000Z',
          kind: 'image',
          url: 'https://cdn.test/ingredient.png',
        },
        metadata: {
          mediaUrl: 'https://cdn.test/metadata.png',
        },
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/metadata.png',
    });
  });
});
