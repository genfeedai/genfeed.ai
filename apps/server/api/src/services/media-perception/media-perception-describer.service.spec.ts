import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { MediaPerceptionDescriberService } from '@api/services/media-perception/media-perception-describer.service';
import {
  MEDIA_SCENE_DESCRIPTION_SCHEMA_NAME,
  mediaSceneDescriptionSchema,
} from '@genfeedai/contracts/api-types/contracts';

describe('MediaPerceptionDescriberService', () => {
  it('sends every frame as an image with OCR and transcript context, schema-enforced', async () => {
    const completeStructured = vi.fn().mockResolvedValue({ summary: 'ok' });
    const service = new MediaPerceptionDescriberService({
      completeStructured,
    } as unknown as LlmDispatcherService);

    await service.describe({
      brandId: 'brand-1',
      durationSeconds: 12,
      frames: [
        {
          height: 100,
          index: 0,
          storageKey: null,
          timestampSeconds: 1.5,
          url: 'https://cdn.example.com/frame-0.jpg',
          width: 100,
        },
      ],
      kind: 'video',
      model: 'openrouter/vision',
      ocr: [
        { frameIndex: 0, text: 'SALE' },
        { frameIndex: 1, text: '' },
      ],
      organizationId: 'org-1',
      transcript: 'x'.repeat(5_000),
    });

    const [params, organizationId, callContext] =
      completeStructured.mock.calls[0];
    expect(organizationId).toBe('org-1');
    expect(callContext).toEqual({ brandId: 'brand-1' });
    expect(params.schema).toBe(mediaSceneDescriptionSchema);
    expect(params.schemaName).toBe(MEDIA_SCENE_DESCRIPTION_SCHEMA_NAME);
    expect(params.model).toBe('openrouter/vision');
    expect(params.messages[0].content).toContain('untrusted observation');

    const userParts = params.messages[1].content;
    const context = JSON.parse(userParts[0].text);
    expect(context.onScreenText).toEqual(['SALE']);
    expect(context.transcript).toHaveLength(4_000);
    expect(userParts).toContainEqual({
      image_url: { url: 'https://cdn.example.com/frame-0.jpg' },
      type: 'image_url',
    });
  });
});
