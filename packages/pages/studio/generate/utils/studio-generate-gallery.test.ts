import { describe, expect, it } from 'vitest';
import {
  buildStudioGalleryQuery,
  resolveStudioGallerySegments,
  STUDIO_GALLERY_PAGE_SIZE,
} from './studio-generate-gallery';

describe('resolveStudioGallerySegments', () => {
  it('fans out across every collection for the all filter', () => {
    expect(resolveStudioGallerySegments('all')).toEqual([
      'images',
      'videos',
      'musics',
      'avatars',
      'voices',
    ]);
  });

  it('reads a single collection for a concrete type', () => {
    expect(resolveStudioGallerySegments('music')).toEqual(['musics']);
    expect(resolveStudioGallerySegments('voice')).toEqual(['voices']);
  });
});

describe('buildStudioGalleryQuery', () => {
  it('scopes to the brand and sorts newest first', () => {
    expect(buildStudioGalleryQuery('brand-1')).toEqual({
      brand: 'brand-1',
      limit: STUDIO_GALLERY_PAGE_SIZE,
      sort: 'createdAt: -1',
    });
  });

  it('omits the brand filter entirely when no brand is resolved', () => {
    expect(buildStudioGalleryQuery('')).toEqual({
      limit: STUDIO_GALLERY_PAGE_SIZE,
      sort: 'createdAt: -1',
    });
  });

  it('honours an explicit limit', () => {
    expect(buildStudioGalleryQuery('brand-1', 4).limit).toBe(4);
  });
});
