import { describe, expect, it } from 'vitest';
import {
  readPersistedStudioReferencePreviewUrl,
  resolveStudioReferencePreviewUrl,
} from './studio-reference-preview';

describe('resolveStudioReferencePreviewUrl', () => {
  it('uses the avatar portrait and ignores attached frames', () => {
    expect(
      resolveStudioReferencePreviewUrl({
        assets: [
          {
            kind: 'image',
            previewUrl: 'https://cdn.example/frame.png',
            role: 'startFrame',
          },
        ],
        avatarPreview: 'https://cdn.example/avatar.png',
        type: 'avatar',
      }),
    ).toBe('https://cdn.example/avatar.png');
  });

  it('prefers the primary edit source, then a start frame, then a reference', () => {
    const assets = [
      {
        kind: 'image' as const,
        previewUrl: 'https://cdn.example/mask.png',
        role: 'editMask' as const,
      },
      {
        kind: 'image' as const,
        previewUrl: 'https://cdn.example/secondary.png',
        role: 'editSource' as const,
      },
      {
        isPrimary: true,
        kind: 'image' as const,
        previewUrl: 'https://cdn.example/primary.png',
        role: 'editSource' as const,
      },
    ];

    expect(
      resolveStudioReferencePreviewUrl({ assets, type: 'image-edit' }),
    ).toBe('https://cdn.example/primary.png');
    expect(
      resolveStudioReferencePreviewUrl({
        assets: [
          {
            kind: 'image',
            previewUrl: 'blob:https://app.genfeed.localhost/frame',
            role: 'endFrame',
          },
          {
            kind: 'image',
            previewUrl: 'https://cdn.example/start.png',
            role: 'startFrame',
          },
          {
            kind: 'video',
            previewUrl: 'https://cdn.example/clip.mp4',
            role: 'videoReference',
          },
        ],
        type: 'video',
      }),
    ).toBe('https://cdn.example/start.png');
    expect(
      resolveStudioReferencePreviewUrl({
        assets: [
          {
            kind: 'image',
            previewUrl: 'https://cdn.example/ref.png',
            role: 'reference',
          },
        ],
        type: 'image',
      }),
    ).toBe('https://cdn.example/ref.png');
  });

  it('drops non-image previews and unsafe URLs', () => {
    expect(
      resolveStudioReferencePreviewUrl({
        assets: [],
        type: 'music',
      }),
    ).toBeUndefined();
    expect(
      resolveStudioReferencePreviewUrl({
        assets: [],
        avatarPreview: 'javascript:alert(1)',
        type: 'avatar',
      }),
    ).toBeUndefined();
    expect(
      readPersistedStudioReferencePreviewUrl(
        'blob:https://app.genfeed.localhost/frame',
      ),
    ).toBeUndefined();
    expect(
      readPersistedStudioReferencePreviewUrl('https://cdn.example/ref.png'),
    ).toBe('https://cdn.example/ref.png');
  });
});
