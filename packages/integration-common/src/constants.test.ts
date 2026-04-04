import { describe, expect, it } from 'vitest';

import { IMAGE_MODELS, REDIS_EVENTS, VIDEO_MODELS } from './constants';

describe('REDIS_EVENTS', () => {
  it('should contain the expected event keys', () => {
    expect(REDIS_EVENTS.INTEGRATION_CREATED).toBe('integration:created');
    expect(REDIS_EVENTS.INTEGRATION_UPDATED).toBe('integration:updated');
    expect(REDIS_EVENTS.INTEGRATION_DELETED).toBe('integration:deleted');
    expect(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL).toBe(
      'discord:send-to-channel',
    );
  });

  it('should have exactly 4 event keys', () => {
    expect(Object.keys(REDIS_EVENTS)).toHaveLength(4);
  });
});

describe('IMAGE_MODELS', () => {
  it('should contain known image model identifiers', () => {
    expect(IMAGE_MODELS).toContain('flux-dev');
    expect(IMAGE_MODELS).toContain('flux-schnell');
    expect(IMAGE_MODELS).toContain('flux-pro');
    expect(IMAGE_MODELS).toContain('sdxl');
    expect(IMAGE_MODELS).toContain('midjourney');
  });

  it('should have exactly 5 entries', () => {
    expect(IMAGE_MODELS).toHaveLength(5);
  });
});

describe('VIDEO_MODELS', () => {
  it('should contain known video model identifiers', () => {
    expect(VIDEO_MODELS).toContain('luma-dream-machine');
    expect(VIDEO_MODELS).toContain('runway-gen3');
    expect(VIDEO_MODELS).toContain('minimax-video');
    expect(VIDEO_MODELS).toContain('kling-ai');
  });

  it('should have exactly 4 entries', () => {
    expect(VIDEO_MODELS).toHaveLength(4);
  });
});
