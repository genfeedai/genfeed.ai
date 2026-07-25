import { HeygenWebhookPayloadDto } from '@api/endpoints/webhooks/dto/heygen-webhook-payload.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const metadata: ArgumentMetadata = {
  data: '',
  metatype: HeygenWebhookPayloadDto,
  type: 'body',
};

describe('HeygenWebhookPayloadDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should reject a non-string event type', async () => {
    await expect(
      pipe.transform({ event_type: 42, video_id: 'video-id' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a non-object event body', async () => {
    await expect(
      pipe.transform(
        { event_data: 'avatar_video.success', event_type: 'avatar_video' },
        metadata,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a non-string video id', async () => {
    await expect(
      pipe.transform(
        { event_type: 'avatar_video.success', video_id: 7 },
        metadata,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accept a success callback and keep the nested event body intact', async () => {
    const payload = {
      event_data: {
        callback_id: 'callback-id',
        folder_id: 'folder-id',
        gif_download_url: 'https://files.heygen.ai/example.gif',
        url: 'https://files.heygen.ai/example.mp4',
        video_id: 'video-id',
      },
      event_type: 'avatar_video.success',
    };

    const result = (await pipe.transform(payload, metadata)) as Record<
      string,
      unknown
    >;

    expect(result).toBeInstanceOf(HeygenWebhookPayloadDto);
    // The whole body is spread into the microservices notification, so nested
    // keys the DTO never declares have to survive the pipe.
    expect(result.event_data).toEqual(payload.event_data);
  });

  it('should accept an event type it has never seen before', async () => {
    const result = (await pipe.transform(
      {
        event_type: 'photo_avatar.training.completed',
        unexpected_envelope_key: { nested: true },
      },
      metadata,
    )) as Record<string, unknown>;

    expect(result.event_type).toBe('photo_avatar.training.completed');
    expect(result.unexpected_envelope_key).toEqual({ nested: true });
  });
});
