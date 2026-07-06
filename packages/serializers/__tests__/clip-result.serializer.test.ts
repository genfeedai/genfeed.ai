import { ClipResultSerializer } from '@serializers/server/content/clip-result.serializer';
import { describe, expect, it } from 'vitest';

/**
 * Guards the raw-cut data contract added in #1239 (epic #1234): the `mode`
 * discriminator serializes when present and is simply absent — never a spurious
 * null — for legacy/avatar records that predate the column.
 */
describe('ClipResultSerializer — raw-cut contract', () => {
  type SerializedResource = {
    data: { id: string; type: string; attributes: Record<string, unknown> };
  };

  it('exposes mode alongside the raw-cut source + output fields when present', () => {
    const output = ClipResultSerializer.serialize({
      captionSrt: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      captionedVideoUrl: 'https://cdn.genfeed.ai/clip-captioned.mp4',
      duration: 30,
      endTime: 45,
      id: 'ckclipresult00000000000001',
      mode: 'raw-cut',
      startTime: 15,
      videoS3Key: 'orgs/org-1/clips/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    }) as SerializedResource;

    expect(output.data.type).toBe('clip-result');
    expect(output.data.attributes).toMatchObject({
      captionSrt: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      captionedVideoUrl: 'https://cdn.genfeed.ai/clip-captioned.mp4',
      duration: 30,
      endTime: 45,
      mode: 'raw-cut',
      startTime: 15,
      videoS3Key: 'orgs/org-1/clips/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });
  });

  it('omits mode from attributes for legacy records that never carried it', () => {
    const output = ClipResultSerializer.serialize({
      id: 'ckclipresult00000000000002',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/legacy-avatar.mp4',
    }) as SerializedResource;

    expect(output.data.attributes.videoUrl).toBe(
      'https://cdn.genfeed.ai/legacy-avatar.mp4',
    );
    expect('mode' in output.data.attributes).toBe(false);
  });
});
