import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function entityId(index: number): string {
  return `c${String(index).padStart(8, '0')}`;
}

const metadata: ArgumentMetadata = { metatype: CreateVideoDto, type: 'body' };

async function rejectedProperties(pipe: ValidationPipe, value: object) {
  try {
    await pipe.transform(value, metadata);
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) {
      throw error;
    }
    const response = error.getResponse() as {
      errors?: Array<{ property: string }>;
    };
    return (response.errors ?? []).map((item) => item.property);
  }
}

async function referencesErrorsFor(referenceCount: number) {
  const dto = plainToInstance(CreateVideoDto, {
    references: Array.from({ length: referenceCount }, (_, i) => entityId(i)),
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'references');
}

describe('CreateVideoDto', () => {
  it('should be defined', () => {
    expect(CreateVideoDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVideoDto();
      expect(dto).toBeInstanceOf(CreateVideoDto);
    });

    it('accepts a references array at the maximum size', async () => {
      expect(await referencesErrorsFor(10)).toEqual([]);
    });

    it('rejects a references array over the maximum size', async () => {
      const referencesErrors = await referencesErrorsFor(11);

      expect(referencesErrors).toHaveLength(1);
      expect(referencesErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });
  });

  // Background music is a Studio editor concern now — generation only
  // generates the video (#4683). The pipe must name the rejected field
  // rather than silently stripping it, so a caller still sending it learns
  // exactly what to remove.
  describe('background music removed from generation', () => {
    const pipe = new ValidationPipe();

    it('rejects backgroundMusic naming the field', async () => {
      const rejected = await rejectedProperties(pipe, {
        backgroundMusic: { ingredientId: entityId(1) },
        text: 'a video',
      });

      expect(rejected).toContain('backgroundMusic');
    });

    it('rejects musicVolume naming the field', async () => {
      const rejected = await rejectedProperties(pipe, {
        musicVolume: 50,
        text: 'a video',
      });

      expect(rejected).toContain('musicVolume');
    });

    it('rejects muteVideoAudio naming the field', async () => {
      const rejected = await rejectedProperties(pipe, {
        muteVideoAudio: true,
        text: 'a video',
      });

      expect(rejected).toContain('muteVideoAudio');
    });

    it('still accepts a plain generation request with none of the removed fields', async () => {
      await expect(
        pipe.transform({ duration: 8, text: 'a video' }, metadata),
      ).resolves.toMatchObject({ duration: 8, text: 'a video' });
    });

    it('no longer types backgroundMusic, musicVolume, or muteVideoAudio on the DTO', () => {
      const dto: Partial<CreateVideoDto> = {
        // @ts-expect-error backgroundMusic was removed from CreateVideoDto (#4683)
        backgroundMusic: { ingredientId: entityId(1) },
        // @ts-expect-error musicVolume was removed from CreateVideoDto (#4683)
        musicVolume: 50,
        // @ts-expect-error muteVideoAudio was removed from CreateVideoDto (#4683)
        muteVideoAudio: true,
      };

      expect(dto).toBeDefined();
    });
  });
});
