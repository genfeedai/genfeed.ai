import { describe, expect, it } from 'vitest';
import {
  extractLastGeneratedAssetFromMessages,
  extractLastGeneratedAssetFromMetadata,
  resolveLastGeneratedAsset,
} from './extract-last-generated-asset.util';

describe('extractLastGeneratedAssetFromMetadata', () => {
  it('prefers the last image on a ui action over earlier text', () => {
    expect(
      extractLastGeneratedAssetFromMetadata({
        uiActions: [
          {
            id: 'action-1',
            images: ['https://cdn.test/first.png', 'https://cdn.test/last.png'],
            title: 'Variants',
            tweets: ['caption'],
            type: 'content_preview_card',
          },
        ],
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/last.png',
    });
  });

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

  it('falls back to message-level mediaUrl', () => {
    expect(
      extractLastGeneratedAssetFromMetadata({
        mediaUrl: 'https://cdn.test/output.webp',
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/output.webp',
    });
  });

  it('returns null when there is no generated media', () => {
    expect(
      extractLastGeneratedAssetFromMetadata({
        uiActions: [
          {
            id: 'text-only',
            textContent: 'Draft caption',
            title: 'Caption',
            type: 'ai_text_action_card',
          },
        ],
      }),
    ).toBeNull();
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

  it('uses later message media over an older ingredient', () => {
    expect(
      resolveLastGeneratedAsset({
        ingredient: {
          createdAt: '2026-08-01T10:00:00.000Z',
          kind: 'image',
          url: 'https://cdn.test/ingredient.png',
        },
        metadata: {
          uiActions: [
            {
              id: 'later',
              images: ['https://cdn.test/later.png'],
              title: 'Later',
              type: 'content_preview_card',
            },
          ],
        },
        metadataCreatedAt: '2026-08-02T10:00:00.000Z',
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://cdn.test/later.png',
    });
  });
});
