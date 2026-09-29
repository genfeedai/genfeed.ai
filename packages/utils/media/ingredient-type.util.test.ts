import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contracts', () => ({
  IngredientCategory: {
    AVATAR: 'avatar',
    GIF: 'gif',
    IMAGE: 'image',
    MUSIC: 'music',
    VIDEO: 'video',
    VOICE: 'voice',
  },
  IngredientExtension: {
    JPG: 'jpg',
    MP4: 'mp4',
    PNG: 'png',
  },
}));

import {
  getIngredientDisplayLabel,
  getIngredientExtension,
  isAvatarIngredient,
  isAvatarSourceImageIngredient,
  isAvatarVideoIngredient,
  isImageIngredient,
  isVideoIngredient,
} from '@utils/media/ingredient-type.util';

interface MockIngredient {
  category: string;
  id?: string;
  metadata?: { extension?: string; label?: string };
  metadataExtension?: string;
  metadataLabel?: string;
}

describe('ingredient-type.util', () => {
  describe('avatar helpers', () => {
    it('should identify avatar family ingredients', () => {
      const ingredient: MockIngredient = { category: 'avatar' };
      expect(isAvatarIngredient(ingredient as never)).toBe(true);
    });

    it('should identify avatar videos from metadataExtension', () => {
      const ingredient: MockIngredient = {
        category: 'avatar',
        metadataExtension: 'mp4',
      };
      expect(isAvatarVideoIngredient(ingredient as never)).toBe(true);
    });

    it('should not identify avatar videos as avatar source images', () => {
      const ingredient: MockIngredient = {
        category: 'avatar',
        metadataExtension: 'mp4',
      };
      expect(isAvatarSourceImageIngredient(ingredient as never)).toBe(false);
    });
  });

  describe('isVideoIngredient', () => {
    it('should return false for undefined', () => {
      expect(isVideoIngredient(undefined as never)).toBe(false);
    });
  });

  describe('isImageIngredient', () => {
    it('should return false for undefined', () => {
      expect(isImageIngredient(undefined as never)).toBe(false);
    });
  });

  describe('getIngredientExtension', () => {
    it('should return "gif" for GIF category', () => {
      const ingredient: MockIngredient = { category: 'gif' };
      expect(getIngredientExtension(ingredient as never)).toBe('gif');
    });

    it('should return "jpg" for image ingredients', () => {
      const ingredient: MockIngredient = { category: 'image' };
      expect(getIngredientExtension(ingredient as never)).toBe('jpg');
    });

    it('should return "mp3" for VOICE category', () => {
      const ingredient: MockIngredient = { category: 'voice' };
      expect(getIngredientExtension(ingredient as never)).toBe('mp3');
    });

    it('should return "bin" for unknown categories', () => {
      const ingredient: MockIngredient = { category: 'unknown' };
      expect(getIngredientExtension(ingredient as never)).toBe('bin');
    });

    it('should return "mp4" for avatar with MP4 metadata', () => {
      const ingredient: MockIngredient = {
        category: 'avatar',
        metadata: { extension: 'mp4' },
      };
      expect(getIngredientExtension(ingredient as never)).toBe('mp4');
    });
  });

  describe('getIngredientDisplayLabel', () => {
    it('should fall back to metadata.label', () => {
      const ingredient: MockIngredient = {
        category: 'avatar',
        id: 'avatar-1',
        metadata: { label: 'Metadata Label' },
      };

      expect(getIngredientDisplayLabel(ingredient as never)).toBe(
        'Metadata Label',
      );
    });

    it('should fall back to id when no labels are available', () => {
      const ingredient: MockIngredient = {
        category: 'avatar',
        id: 'avatar-1',
      };

      expect(getIngredientDisplayLabel(ingredient as never)).toBe('avatar-1');
    });
  });
});
