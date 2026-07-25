import { ReplicateWebhookPayloadDto } from '@api/endpoints/webhooks/dto/replicate-webhook-payload.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const metadata: ArgumentMetadata = {
  data: '',
  metatype: ReplicateWebhookPayloadDto,
  type: 'body',
};

describe('ReplicateWebhookPayloadDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should reject a body without the prediction id', async () => {
    await expect(
      pipe.transform({ status: 'succeeded' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a body without the status', async () => {
    await expect(
      pipe.transform({ id: 'prediction-id' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a non-string status', async () => {
    await expect(
      pipe.transform({ id: 'prediction-id', status: 200 }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('should report the offending property', async () => {
    expect.assertions(1);

    try {
      await pipe.transform({ status: 'succeeded' }, metadata);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: [{ property: 'id' }],
        message: 'Validation failed',
      });
    }
  });

  it('should accept a real callback and keep undeclared vendor keys', async () => {
    const payload = {
      created_at: '2026-07-25T09:59:00.000Z',
      id: 'prediction-id',
      input: { prompt: 'a cat' },
      metrics: { predict_time: 4.2 },
      model: 'owner/name',
      output: ['https://replicate.delivery/example.png'],
      status: 'succeeded',
      urls: { get: 'https://api.replicate.com/v1/predictions/prediction-id' },
      version: 'version-id',
    };

    const result = (await pipe.transform(payload, metadata)) as Record<
      string,
      unknown
    >;

    expect(result).toBeInstanceOf(ReplicateWebhookPayloadDto);
    // `metrics`, `urls`, and `created_at` are not declared on the DTO. The
    // handler reads several such keys through the base index signature, so
    // whitelist stripping must stay off for this family.
    expect(Object.keys(result)).toEqual(Object.keys(payload));
    expect(result.metrics).toEqual({ predict_time: 4.2 });
  });

  it('should accept a failed prediction whose output is absent', async () => {
    const result = (await pipe.transform(
      { error: 'NSFW content detected', id: 'prediction-id', status: 'failed' },
      metadata,
    )) as Record<string, unknown>;

    expect(result.error).toBe('NSFW content detected');
    expect(result).not.toHaveProperty('output');
  });
});
