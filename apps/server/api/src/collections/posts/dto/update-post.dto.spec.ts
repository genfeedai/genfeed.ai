import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';

describe('UpdatePostDto', () => {
  it('should be defined', () => {
    expect(UpdatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePostDto();
      expect(dto).toBeInstanceOf(UpdatePostDto);
    });

    it('accepts partial publish attribution updates', async () => {
      const dto = Object.assign(new UpdatePostDto(), {
        contentRunId: 'ckz1234567890abcdefghi',
        creativeVersion: 'creative-v2',
        hookVersion: 'hook-v1',
        personaId: 'ckz1234567890abcdefgij',
        publishIntent: 'campaign',
        scheduleSlot: 'weekday-morning',
        variantId: 'variant-a',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts canonical scalar IDs and public relation ID arrays', async () => {
      const dto = Object.assign(new UpdatePostDto(), {
        credentialId: 'ckz1234567890abcdefghi',
        ingredients: ['ckz1234567890abcdefgij'],
        parentId: 'ckz1234567890abcdefgik',
        tags: ['ckz1234567890abcdefgil'],
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects Mongo-era relation aliases', async () => {
      const dto = Object.assign(new UpdatePostDto(), {
        credential: 'ckz1234567890abcdefghi',
        parent: 'ckz1234567890abcdefgik',
      });

      const errors = await validate(dto, {
        forbidNonWhitelisted: true,
        whitelist: true,
      });

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['credential', 'parent']),
      );
    });

    it('rejects leftover Post.status through the request pipe', async () => {
      const pipe = new ValidationPipe();

      await expect(
        pipe.transform(
          { status: 'draft' },
          { metatype: UpdatePostDto, type: 'body' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
