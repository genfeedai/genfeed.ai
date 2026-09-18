import { describe, expect, it } from 'vitest';
import { withPublicMediaUrl } from '@/utils/media-status';

describe('withPublicMediaUrl', () => {
  it('recovers a download URL from cdnUrl without starting a new generation', () => {
    expect(
      withPublicMediaUrl({
        cdnUrl: 'https://cdn.example.com/img.png',
        id: 'img-1',
      })
    ).toEqual({
      cdnUrl: 'https://cdn.example.com/img.png',
      id: 'img-1',
      url: 'https://cdn.example.com/img.png',
    });
  });
});
