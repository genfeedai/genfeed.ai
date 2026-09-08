import {
  IMAGE_MODELS,
  REDIS_EVENTS,
  VIDEO_MODELS,
} from '@integrations/constants';

describe('Integration Common Types', () => {
  describe('Model constants', () => {
    it('should export valid image models', () => {
      expect(IMAGE_MODELS).toContain('flux-dev');
      expect(IMAGE_MODELS).toContain('flux-schnell');
      expect(IMAGE_MODELS).toContain('flux-pro');
      expect(IMAGE_MODELS).toContain('sdxl');
      expect(IMAGE_MODELS).toContain('midjourney');
    });

    it('should export valid video models', () => {
      expect(VIDEO_MODELS).toContain('luma-dream-machine');
      expect(VIDEO_MODELS).toContain('runway-gen3');
      expect(VIDEO_MODELS).toContain('minimax-video');
      expect(VIDEO_MODELS).toContain('kling-ai');
    });
  });

  describe('Redis Events', () => {
    it('should export correct event constants', () => {
      expect(REDIS_EVENTS.INTEGRATION_CREATED).toBe('integration:created');
      expect(REDIS_EVENTS.INTEGRATION_UPDATED).toBe('integration:updated');
      expect(REDIS_EVENTS.INTEGRATION_DELETED).toBe('integration:deleted');
    });
  });
});
