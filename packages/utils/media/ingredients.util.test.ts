import { IngredientEndpoints } from '@utils/media/ingredients.util';
import { describe, expect, it } from 'vitest';

describe('ingredients.util', () => {
  describe('IngredientEndpoints', () => {
    describe('endpoints', () => {
      it('should have correct endpoint mappings', () => {
        expect(IngredientEndpoints.endpoints.IMAGE).toBe('images');
        expect(IngredientEndpoints.endpoints.VIDEO).toBe('videos');
        expect(IngredientEndpoints.endpoints.MUSIC).toBe('musics');
        expect(IngredientEndpoints.endpoints.VOICE).toBe('voices');
        expect(IngredientEndpoints.endpoints.GIF).toBe('gifs');
        expect(IngredientEndpoints.endpoints.AVATAR).toBe('avatars');
        expect(IngredientEndpoints.endpoints.INGREDIENT).toBe('ingredients');
        expect(IngredientEndpoints.endpoints.SOURCE).toBe('sources');
        expect(IngredientEndpoints.endpoints.TEXT).toBe('texts');
        expect(IngredientEndpoints.endpoints.AUDIO).toBe('audios');
      });

      it('should map IMAGE_EDIT to images endpoint', () => {
        expect(IngredientEndpoints.endpoints.IMAGE_EDIT).toBe('images');
      });

      it('should map VIDEO_EDIT to videos endpoint', () => {
        expect(IngredientEndpoints.endpoints.VIDEO_EDIT).toBe('videos');
      });
    });

    describe('getEndpoint', () => {
      it('should return correct endpoint for known category', () => {
        expect(IngredientEndpoints.getEndpoint('IMAGE')).toBe('images');
        expect(IngredientEndpoints.getEndpoint('VIDEO')).toBe('videos');
        expect(IngredientEndpoints.getEndpoint('MUSIC')).toBe('musics');
      });

      it('should return "ingredients" for unknown category', () => {
        expect(IngredientEndpoints.getEndpoint('UNKNOWN' as never)).toBe(
          'ingredients',
        );
      });
    });

    describe('getEndpointFromTypeOrPath', () => {
      it('should map uppercase type to endpoint', () => {
        expect(IngredientEndpoints.getEndpointFromTypeOrPath('IMAGE')).toBe(
          'images',
        );
        expect(IngredientEndpoints.getEndpointFromTypeOrPath('VIDEO')).toBe(
          'videos',
        );
      });

      it('should normalize image-to-videos path', () => {
        expect(
          IngredientEndpoints.getEndpointFromTypeOrPath('image-to-videos'),
        ).toBe('videos');
      });

      it('should return normalized path for unknown types', () => {
        expect(
          IngredientEndpoints.getEndpointFromTypeOrPath('custom-path'),
        ).toBe('custom-path');
      });
    });

    describe('getPath', () => {
      it('should return path with endpoint for category', () => {
        expect(IngredientEndpoints.getPath('IMAGE')).toBe('/images');
      });

      it('should return path with id when provided', () => {
        expect(IngredientEndpoints.getPath('VIDEO', 'video-123')).toBe(
          '/videos/video-123',
        );
      });

      it('should return path without id when not provided', () => {
        expect(IngredientEndpoints.getPath('MUSIC')).toBe('/musics');
      });
    });

    describe('normalizeUrlPath', () => {
      it('should convert "image-to-videos" to "videos"', () => {
        expect(IngredientEndpoints.normalizeUrlPath('image-to-videos')).toBe(
          'videos',
        );
      });

      it('should return other paths unchanged', () => {
        expect(IngredientEndpoints.normalizeUrlPath('images')).toBe('images');
        expect(IngredientEndpoints.normalizeUrlPath('videos')).toBe('videos');
        expect(IngredientEndpoints.normalizeUrlPath('custom')).toBe('custom');
      });
    });
  });
});
