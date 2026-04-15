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
    it('should return clerk-based room when clerkUserId is provided', () => {
      expect(getUserRoom('clerk_abc', 'db_123')).toBe('user:clerk_abc');
    });

    it('should return db-based room when only dbUserId is provided', () => {
      expect(getUserRoom(undefined, 'db_123')).toBe('user:db_123');
    });

    it('should return undefined when no IDs are provided', () => {
      expect(getUserRoom()).toBeUndefined();
    });

    it('should prefer clerkUserId over dbUserId', () => {
      expect(getUserRoom('clerk_abc', 'db_123')).toBe('user:clerk_abc');
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
    it('should be valid when clerkUserId is present', () => {
      const result = validateRoomMatch('clerk_abc', 'db_123');

      expect(result.isValid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should warn when only dbUserId is present', () => {
      const result = validateRoomMatch(undefined, 'db_123');

      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('clerkId');
    });

    it('should warn when no IDs are present', () => {
      const result = validateRoomMatch();

      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('No user ID');
    });
  });

  describe('resolveRoom', () => {
    it('should return userRoom when available', () => {
      expect(resolveRoom('user:clerk_abc', 'clerk_abc')).toBe(
        'user:clerk_abc',
      );
    });

    it('should fall back to userId-based room', () => {
      expect(resolveRoom(undefined, 'clerk_abc')).toBe('user:clerk_abc');
    });

    it('should return undefined when nothing is available', () => {
      expect(resolveRoom()).toBeUndefined();
    });
  });
});
