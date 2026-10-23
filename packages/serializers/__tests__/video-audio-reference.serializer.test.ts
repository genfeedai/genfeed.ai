import {
  VideoGenerationSerializer,
  VideoSerializer,
} from '@serializers/server/ingredients/video.serializer';
import { describe, expect, it } from 'vitest';

describe('video audio-reference transport', () => {
  it('keeps ordered reference IDs in requests and out of public responses', () => {
    const request = {
      id: 'video',
      audioReferences: ['voice-2', 'voice-1'],
      videoReferences: ['driver'],
    };
    expect(VideoGenerationSerializer.serialize(request)).toMatchObject({
      data: {
        attributes: {
          audioReferences: request.audioReferences,
          videoReferences: request.videoReferences,
        },
      },
    });
    const response = JSON.stringify(VideoSerializer.serialize(request));
    expect(response).not.toContain('audioReferences');
    expect(response).not.toContain('videoReferences');
  });
});
