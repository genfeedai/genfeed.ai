import { WebSocketPaths } from '@utils/network/websocket.util';
import { describe, expect, it } from 'vitest';

describe('websocket.util', () => {
  describe('WebSocketPaths', () => {
    it('should generate activity path', () => {
      expect(WebSocketPaths.activity('act-123')).toBe('/activities/act-123');
    });

    it('should generate brand path', () => {
      expect(WebSocketPaths.brand('brand-456')).toBe('/brands/brand-456');
    });

    it('should generate image path', () => {
      expect(WebSocketPaths.image('img-789')).toBe('/images/img-789');
    });

    it('should generate music path', () => {
      expect(WebSocketPaths.music('mus-101')).toBe('/musics/mus-101');
    });

    it('should generate organization path', () => {
      expect(WebSocketPaths.organization('org-abc')).toBe(
        '/organizations/org-abc',
      );
    });

    it('should generate prompt path', () => {
      expect(WebSocketPaths.prompt('pmt-def')).toBe('/prompts/pmt-def');
    });

    it('should generate publication path', () => {
      expect(WebSocketPaths.publication('pub-ghi')).toBe('/posts/pub-ghi');
    });

    it('should generate script path', () => {
      expect(WebSocketPaths.script('scr-jkl')).toBe('/scripts/scr-jkl');
    });

    it('should generate user path', () => {
      expect(WebSocketPaths.user('usr-mno')).toBe('/users/usr-mno');
    });

    it('should generate video path', () => {
      expect(WebSocketPaths.video('vid-pqr')).toBe('/videos/vid-pqr');
    });

    it('should handle UUIDs as IDs', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(WebSocketPaths.user(uuid)).toBe(`/users/${uuid}`);
    });

    it('should handle empty string IDs', () => {
      expect(WebSocketPaths.activity('')).toBe('/activities/');
    });

    it('should handle IDs with special characters', () => {
      expect(WebSocketPaths.brand('brand/123')).toBe('/brands/brand/123');
    });
  });
});
