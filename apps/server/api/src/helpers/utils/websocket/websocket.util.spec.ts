import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';

describe('WebSocketPaths', () => {
  describe('activity', () => {});

  describe('post', () => {});

  describe('path consistency', () => {
    it('should follow consistent path format for all generators', () => {
      const id = 'test-id-123';

      expect(WebSocketPaths.prompt(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.video(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.image(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.music(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.script(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.brand(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.organization(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.user(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.activity(id)).toMatch(/^\/\w+\/test-id-123$/);
      expect(WebSocketPaths.post(id)).toMatch(/^\/\w+\/test-id-123$/);
    });

    it('should handle special characters in IDs', () => {
      const id = 'id-with-dashes-123';

      expect(WebSocketPaths.video(id)).toBe(`/videos/${id}`);
      expect(WebSocketPaths.image(id)).toBe(`/images/${id}`);
    });

    it('should handle empty string IDs', () => {
      expect(WebSocketPaths.video('')).toBe('/videos/');
      expect(WebSocketPaths.image('')).toBe('/images/');
    });
  });
});
