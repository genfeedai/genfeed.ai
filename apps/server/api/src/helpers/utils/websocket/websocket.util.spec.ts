import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { testId } from '@helpers/testing/test-id.helper';

describe('WebSocketPaths', () => {
  describe('prompt', () => {
    it('should generate correct prompt path', () => {
      const promptId = testId('prompt');
      const result = WebSocketPaths.prompt(promptId);

      expect(result).toBe(`/prompts/${promptId}`);
    });
  });

  describe('video', () => {
    it('should generate correct video path', () => {
      const videoId = testId('video');
      const result = WebSocketPaths.video(videoId);

      expect(result).toBe(`/videos/${videoId}`);
    });
  });

  describe('image', () => {
    it('should generate correct image path', () => {
      const imageId = testId('image');
      const result = WebSocketPaths.image(imageId);

      expect(result).toBe(`/images/${imageId}`);
    });
  });

  describe('music', () => {
    it('should generate correct music path', () => {
      const musicId = testId('music');
      const result = WebSocketPaths.music(musicId);

      expect(result).toBe(`/musics/${musicId}`);
    });
  });

  describe('script', () => {
    it('should generate correct script path', () => {
      const scriptId = testId('script');
      const result = WebSocketPaths.script(scriptId);

      expect(result).toBe(`/scripts/${scriptId}`);
    });
  });

  describe('brand', () => {
    it('should generate correct brand path', () => {
      const brandId = testId('brand');
      const result = WebSocketPaths.brand(brandId);

      expect(result).toBe(`/brands/${brandId}`);
    });
  });

  describe('organization', () => {
    it('should generate correct organization path', () => {
      const organizationId = testId('org');
      const result = WebSocketPaths.organization(organizationId);

      expect(result).toBe(`/organizations/${organizationId}`);
    });
  });

  describe('user', () => {
    it('should generate correct user path', () => {
      const userId = testId('user');
      const result = WebSocketPaths.user(userId);

      expect(result).toBe(`/users/${userId}`);
    });
  });

  describe('activity', () => {
    it('should generate correct activity path', () => {
      const activityId = testId('activity');
      const result = WebSocketPaths.activity(activityId);

      expect(result).toBe(`/activities/${activityId}`);
    });
  });

  describe('post', () => {
    it('should generate correct publication path', () => {
      const postId = testId('post');
      const result = WebSocketPaths.post(postId);

      expect(result).toBe(`/posts/${postId}`);
    });
  });

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
