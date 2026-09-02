import {
  getCacheTag,
  getIngredientPath,
  getUserRoom,
  resolveRoom,
  validateRoomMatch,
} from '@api/helpers/utils/websocket-room/websocket-room.util';
import { IngredientCategory } from '@genfeedai/enums';

describe('WebSocketRoomUtil', () => {
  describe('getUserRoom', () => {
    it('should return the user room when userId is provided', () => {
      expect(getUserRoom('user_123')).toBe('user:user_123');
    });

    it('should return undefined when no ID is provided', () => {
      expect(getUserRoom()).toBeUndefined();
    });
  });

  describe('getIngredientPath', () => {
    it('should build video path', () => {
      expect(getIngredientPath(IngredientCategory.VIDEO, 'abc123')).toBe(
        '/videos/abc123',
      );
    });

    it('should build image path', () => {
      expect(getIngredientPath(IngredientCategory.IMAGE, 'def456')).toBe(
        '/images/def456',
      );
    });

    it('should build music path', () => {
      expect(getIngredientPath(IngredientCategory.MUSIC, 'ghi789')).toBe(
        '/musics/ghi789',
      );
    });

    it('should handle string category', () => {
      expect(getIngredientPath('video', 'abc123')).toBe('/videos/abc123');
    });
  });

  describe('getCacheTag', () => {
    it('should return "videos" for VIDEO', () => {
      expect(getCacheTag(IngredientCategory.VIDEO)).toBe('videos');
    });

    it('should return "images" for IMAGE', () => {
      expect(getCacheTag(IngredientCategory.IMAGE)).toBe('images');
    });

    it('should return "musics" for MUSIC', () => {
      expect(getCacheTag(IngredientCategory.MUSIC)).toBe('musics');
    });
  });

  describe('validateRoomMatch', () => {
    it('should be valid when userId is present', () => {
      const result = validateRoomMatch('user_123');

      expect(result.isValid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should warn when no ID is present', () => {
      const result = validateRoomMatch();

      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('No user ID');
    });
  });

  describe('resolveRoom', () => {
    it('should return userRoom when available', () => {
      expect(resolveRoom('user:user_123', 'user_123')).toBe('user:user_123');
    });

    it('should fall back to userId-based room', () => {
      expect(resolveRoom(undefined, 'user_123')).toBe('user:user_123');
    });

    it('should return undefined when nothing is available', () => {
      expect(resolveRoom()).toBeUndefined();
    });
  });
});
