import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';

describe('UpdateMusicDto', () => {
  it('should be defined', () => {
    expect(UpdateMusicDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateMusicDto();
      expect(dto).toBeInstanceOf(UpdateMusicDto);
    });
  });

  describe('storage identity', () => {
    // Music rows are ingredients. The DTO does not declare s3Key or cdnUrl,
    // so the whitelisting pipe strips them before the controller sees them.
    const pipe = new ValidationPipe();
    const metadata: ArgumentMetadata = {
      metatype: UpdateMusicDto,
      type: 'body',
    };

    it('strips client-supplied s3Key and cdnUrl through the global pipe', async () => {
      const result = await pipe.transform(
        {
          cdnUrl: 'https://cdn.genfeed.ai/ingredients/musics/other-tenant',
          s3Key: 'ingredients/musics/other-tenant',
        },
        metadata,
      );

      expect(result).not.toHaveProperty('s3Key');
      expect(result).not.toHaveProperty('cdnUrl');
    });
  });
});
