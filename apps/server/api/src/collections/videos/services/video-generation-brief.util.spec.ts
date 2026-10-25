import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { collectGenerationSourceIds } from '@api/collections/videos/services/video-generation-brief.util';
import { describe, expect, it } from 'vitest';

describe('collectGenerationSourceIds', () => {
  it('lists every reference once, in reference, end frame, video, audio order', () => {
    const dto = {
      audioReferences: ['audio-1'],
      endFrame: 'img-2',
      videoReferences: ['video-1', 'img-1'],
    } as CreateVideoDto;

    expect(collectGenerationSourceIds(dto, ['img-1', 'img-2'])).toEqual([
      'img-1',
      'img-2',
      'video-1',
      'audio-1',
    ]);
  });

  it('returns only the image references when nothing else is attached', () => {
    expect(collectGenerationSourceIds({} as CreateVideoDto, ['img-1'])).toEqual(
      ['img-1'],
    );
  });
});
