import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { UpdateGenerationHarnessSettingsDto } from '@api/services/harness/generation-harness.controller';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('Generation harness strict inputs', () => {
  it.each([true, false, null])('accepts preference %s', async (isEnabled) => {
    const errors = await validate(
      plainToInstance(UpdateGenerationHarnessSettingsDto, {
        scope: 'organization',
        isEnabled,
      }),
    );
    expect(errors).toEqual([]);
  });

  it.each(['true', 'false', 1, undefined])(
    'rejects preference %s',
    async (isEnabled) => {
      const errors = await validate(
        plainToInstance(UpdateGenerationHarnessSettingsDto, {
          scope: 'organization',
          isEnabled,
        }),
      );
      expect(errors.some((error) => error.property === 'isEnabled')).toBe(true);
    },
  );

  it.each([CreateImageDto, CreateVideoDto])(
    'rejects string and null per-call overrides',
    async (Dto) => {
      for (const harness of ['false', null, 1]) {
        const errors = await validate(
          plainToInstance(Dto, { text: 'prompt', harness }),
        );
        expect(errors.some((error) => error.property === 'harness')).toBe(true);
      }
      for (const harness of [true, false, undefined]) {
        const errors = await validate(
          plainToInstance(Dto, { text: 'prompt', harness }),
        );
        expect(errors.some((error) => error.property === 'harness')).toBe(
          false,
        );
      }
    },
  );
});
