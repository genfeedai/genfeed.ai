import {
  resolveRoom,
  validateRoomMatch,
} from '@api/helpers/utils/websocket-room/websocket-room.util';

describe('WebSocketRoomUtil', () => {
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
