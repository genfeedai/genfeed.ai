import { createHmac } from 'node:crypto';
import { ChromaticWebhookPayloadDto } from '@api/endpoints/webhooks/dto/chromatic-webhook-payload.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const metadata: ArgumentMetadata = {
  data: '',
  metatype: ChromaticWebhookPayloadDto,
  type: 'body',
};

/**
 * A payload shaped like a real Chromatic build notification, including keys the
 * DTO does not declare (`webhookVersion`, and everything nested under `build`).
 *
 * Held as a raw JSON string on purpose. The assertions below compare serialized
 * bytes rather than deep equality, so the key order has to be exactly what
 * Chromatic sent — an object literal would be silently re-sorted by the
 * repository's key-sorting formatter and the test would stop proving anything.
 */
const CHROMATIC_RAW_BODY =
  '{"event":"build","webhookVersion":2,"build":{"number":128,"branch":"feat/example","status":"ACCEPTED","changeCount":2,"componentCount":41,"webUrl":"https://www.chromatic.com/build?appId=abc&number=128"},"commit":{"sha":"0f2c1b4d5e6f708192a3b4c5d6e7f8091a2b3c4d","authorName":"Example Author","message":"feat: example"},"project":{"id":"project-id","name":"genfeed"},"timestamp":"2026-07-25T10:00:00.000Z"}';

describe('ChromaticWebhookPayloadDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should preserve the exact JSON bytes the signature is computed over', async () => {
    const result = await pipe.transform(
      JSON.parse(CHROMATIC_RAW_BODY),
      metadata,
    );

    // The controller HMACs `JSON.stringify(payload)` — i.e. the pipe's output.
    // Any reordering, stripping, or defaulted field would invalidate a signature
    // Chromatic computed over the original body.
    expect(JSON.stringify(result)).toBe(CHROMATIC_RAW_BODY);
  });

  it('should keep an HMAC over the transformed payload verifiable', async () => {
    const secret = 'chromatic-test-secret';
    const expected = createHmac('sha256', secret)
      .update(CHROMATIC_RAW_BODY)
      .digest('hex');

    const result = await pipe.transform(
      JSON.parse(CHROMATIC_RAW_BODY),
      metadata,
    );
    const actual = createHmac('sha256', secret)
      .update(Buffer.from(JSON.stringify(result)))
      .digest('hex');

    expect(actual).toBe(expected);
  });

  it('should not materialise properties the provider did not send', async () => {
    const result = (await pipe.transform(
      { event: 'build' },
      metadata,
    )) as Record<string, unknown>;

    expect(Object.keys(result)).toEqual(['event']);
    expect(result).not.toHaveProperty('build');
  });

  it('should reject a malformed payload', async () => {
    await expect(
      pipe.transform({ branch: 42, event: 'build' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a non-object nested container', async () => {
    await expect(
      pipe.transform({ build: 'not-an-object', event: 'build' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });
});
