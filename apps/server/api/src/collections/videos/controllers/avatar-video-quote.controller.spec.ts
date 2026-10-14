import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { CreateAvatarVideoDto } from '@api/collections/videos/dto/create-avatar-video.dto';
import type { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import {
  type ArgumentMetadata,
  BadRequestException,
  HttpException,
  HttpStatus,
  RequestMethod,
} from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

const organizationId = testId('org');
const brandId = testId('brand');
const user = {
  brandId,
  id: 'auth-provider-user',
  organizationId,
  userId: 'user-123',
};
const request = { originalUrl: '/videos/avatar/quote' };
const photoBody = {
  heygenVoiceId: 'voice-1',
  photoUrl: 'https://cdn.example.com/portrait.png',
  text: 'Hello from Genfeed',
};

function createController(quote: ReturnType<typeof vi.fn>) {
  const generation = { generateAvatarVideo: vi.fn(), quote };
  const controller = new AvatarVideoController(
    generation as unknown as AvatarVideoGenerationService,
    { findOne: vi.fn() } as unknown as VideosService,
  );
  return { controller, generation };
}

describe('POST /videos/avatar/quote', () => {
  it.each([
    [
      'a photo animation per second',
      {
        billingMode: 'platform',
        credits: 52,
        estimatedSeconds: 4,
        modelKey: MODEL_KEYS.HEYGEN_AVATAR,
      },
    ],
    [
      'a trained look by its engine',
      {
        billingMode: 'platform',
        credits: 269,
        estimatedSeconds: 10,
        modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
      },
    ],
    [
      'a BYOK render at zero platform credits',
      {
        billingMode: 'byok',
        credits: 0,
        estimatedSeconds: null,
        modelKey: MODEL_KEYS.HEYGEN_AVATAR,
      },
    ],
  ])('serializes the admission price for %s', async (_label, price) => {
    const { controller, generation } = createController(
      vi.fn().mockResolvedValue(price),
    );

    const response = await controller.quoteAvatarVideo(
      request as never,
      user as never,
      photoBody,
    );

    expect(response.data).toEqual({
      attributes: price,
      id: expect.any(String),
      type: 'avatar-generation-quote',
    });
    expect(generation.generateAvatarVideo).not.toHaveBeenCalled();
  });

  it('quotes for the authenticated tenant with no credits request to hold against', async () => {
    const quote = vi.fn().mockResolvedValue({
      billingMode: 'platform',
      credits: 13,
      estimatedSeconds: 1,
      modelKey: MODEL_KEYS.HEYGEN_AVATAR,
    });
    const { controller } = createController(quote);

    await controller.quoteAvatarVideo(request as never, user as never, {
      ...photoBody,
      autoSelectModel: false,
      model: MODEL_KEYS.HEYGEN_AVATAR_IV,
    });

    expect(quote).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        autoSelectModel: false,
        heygenVoiceId: 'voice-1',
        model: MODEL_KEYS.HEYGEN_AVATAR_IV,
        photoUrl: photoBody.photoUrl,
        text: photoBody.text,
      }),
      { brandId, organizationId, userId: 'user-123' },
    );
  });

  it('surfaces the admission refusal generation would raise', async () => {
    const { controller } = createController(
      vi
        .fn()
        .mockRejectedValue(
          new HttpException('Training is incomplete', HttpStatus.BAD_REQUEST),
        ),
    );

    await expect(
      controller.quoteAvatarVideo(request as never, user as never, photoBody),
    ).rejects.toThrow('Training is incomplete');
  });

  it('is a rate-limited 200 POST beside the generation route, with no credits guard', () => {
    const handler = AvatarVideoController.prototype.quoteAvatarVideo;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('avatar/quote');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.OK,
    );
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toMatchObject({
      scope: 'organization',
    });
    expect(Reflect.getMetadata('credits', handler)).toBeUndefined();
  });

  describe('body validation', () => {
    const metadata: ArgumentMetadata = {
      data: '',
      metatype: CreateAvatarVideoDto,
      type: 'body',
    };

    it.each([
      ['an unsupported aspect ratio', { aspectRatio: '4:5' }],
      ['an unknown routing priority', { prioritize: 'cheapest' }],
      ['a non-string script', { text: 42 }],
    ])('rejects %s before quoting', async (_label, invalid) => {
      await expect(
        new ValidationPipe().transform({ ...photoBody, ...invalid }, metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('drops a caller-sent organization so the quote stays tenant-scoped', async () => {
      const dto = await new ValidationPipe().transform(
        { ...photoBody, organizationId: testId('other-org') },
        metadata,
      );

      expect(dto).not.toHaveProperty('organizationId');
    });
  });
});
