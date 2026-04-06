import {
  buildWorkflowMediaNodePatch,
  clearCurrentWorkflowMedia,
  createWorkflowMediaSelectionConfig,
  createWorkflowMediaUrlConfig,
  getWorkflowMediaConfig,
  setWorkflowMediaSource,
  toWorkflowMediaSelection,
} from '@workflow-cloud/nodes/input/media-picker';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://ingredients.example.com',
  },
}));

describe('workflow media picker helpers', () => {
  it('builds image picker selections from gallery items', () => {
    const selection = toWorkflowMediaSelection(
      {
        id: 'img-1',
        label: 'Bedroom',
        url: 'https://cdn.example.com/bedroom.png',
        width: 1280,
      },
      'image',
      'library',
    );

    expect(selection).toEqual({
      dimensions: null,
      duration: null,
      id: 'img-1',
      itemCategory: 'image',
      label: 'Bedroom',
      mimeType: null,
      resolvedUrl: 'https://cdn.example.com/bedroom.png',
      thumbnailUrl: null,
    });
  });

  it('builds reference selections from brand assets', () => {
    const selection = toWorkflowMediaSelection(
      {
        id: 'ref-1',
      },
      'image',
      'brand-references',
    );

    expect(selection?.itemCategory).toBe('reference');
    expect(selection?.resolvedUrl).toBe(
      'https://ingredients.example.com/references/ref-1',
    );
  });

  it('preserves selected media when switching to url and back', () => {
    const config = createWorkflowMediaSelectionConfig(
      getWorkflowMediaConfig({}, 'image'),
      'library',
      {
        dimensions: { height: 1080, width: 1920 },
        duration: null,
        id: 'img-1',
        itemCategory: 'image',
        label: 'Living Room',
        mimeType: 'image/png',
        resolvedUrl: 'https://cdn.example.com/living-room.png',
        thumbnailUrl: null,
      },
    );

    const switchedToUrl = setWorkflowMediaSource(config, 'url');
    expect(switchedToUrl.resolvedUrl).toBeNull();
    expect(switchedToUrl.itemId).toBe('img-1');

    const withUrl = createWorkflowMediaUrlConfig(
      switchedToUrl,
      'https://cdn.example.com/manual.png',
    );
    expect(withUrl.resolvedUrl).toBe('https://cdn.example.com/manual.png');

    const switchedBack = setWorkflowMediaSource(withUrl, 'library');
    expect(switchedBack.resolvedUrl).toBe(
      'https://cdn.example.com/living-room.png',
    );
    expect(switchedBack.url).toBe('https://cdn.example.com/manual.png');
  });

  it('clears only the active source payload', () => {
    const urlConfig = createWorkflowMediaUrlConfig(
      getWorkflowMediaConfig({}, 'video'),
      'https://cdn.example.com/video.mp4',
    );

    const clearedUrl = clearCurrentWorkflowMedia(urlConfig);
    expect(clearedUrl.url).toBeNull();
    expect(clearedUrl.resolvedUrl).toBeNull();

    const mediaConfig = createWorkflowMediaSelectionConfig(
      getWorkflowMediaConfig({}, 'video'),
      'library',
      {
        dimensions: { height: 1080, width: 1920 },
        duration: 12.4,
        id: 'vid-1',
        itemCategory: 'video',
        label: 'Promo',
        mimeType: 'video/mp4',
        resolvedUrl: 'https://cdn.example.com/promo.mp4',
        thumbnailUrl: 'https://cdn.example.com/promo.jpg',
      },
    );

    const clearedMedia = clearCurrentWorkflowMedia(mediaConfig);
    expect(clearedMedia.itemId).toBeNull();
    expect(clearedMedia.selectedResolvedUrl).toBeNull();
    expect(clearedMedia.url).toBeNull();
  });

  it('builds node patches with executable config', () => {
    const config = createWorkflowMediaSelectionConfig(
      getWorkflowMediaConfig({}, 'image'),
      'brand-references',
      {
        dimensions: null,
        duration: null,
        id: 'ref-1',
        itemCategory: 'reference',
        label: 'Reference',
        mimeType: null,
        resolvedUrl: 'https://ingredients.example.com/references/ref-1',
        thumbnailUrl: 'https://ingredients.example.com/references/ref-1',
      },
    );

    const patch = buildWorkflowMediaNodePatch('image', config);

    expect(patch.image).toBe(
      'https://ingredients.example.com/references/ref-1',
    );
    expect(patch.config).toMatchObject({
      itemCategory: 'reference',
      itemId: 'ref-1',
      resolvedUrl: 'https://ingredients.example.com/references/ref-1',
      selectedResolvedUrl: 'https://ingredients.example.com/references/ref-1',
      source: 'brand-references',
    });
  });
});
