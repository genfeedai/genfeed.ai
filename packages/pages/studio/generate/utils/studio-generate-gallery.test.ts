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
      'voices',
    ]);
  });

  it('never pages one collection twice when two types share it', () => {
    // Avatar clips are stored as videos — fanning out to `/videos` twice would
    // double every video row in the grid.
    const segments = resolveStudioGallerySegments('all');

    expect(new Set(segments).size).toBe(segments.length);
  });

  it('reads a single collection for a concrete type', () => {
    expect(resolveStudioGallerySegments('music')).toEqual(['musics']);
    expect(resolveStudioGallerySegments('voice')).toEqual(['voices']);
    expect(resolveStudioGallerySegments('avatar')).toEqual(['videos']);
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
