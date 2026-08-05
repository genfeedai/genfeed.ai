import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { CaptionFormat } from '@genfeedai/enums';
import { validate } from 'class-validator';

describe('CreateCaptionDto', () => {
  it('should be defined', () => {
    expect(CreateCaptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateCaptionDto();
      expect(dto).toBeInstanceOf(CreateCaptionDto);
    });

    it('accepts the canonical ingredientId field', async () => {
      const dto = Object.assign(new CreateCaptionDto(), {
        format: CaptionFormat.SRT,
        ingredientId: 'ckz1234567890abcdefghi',
        language: 'en',
      });

      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the removed ingredient alias', async () => {
      const dto = Object.assign(new CreateCaptionDto(), {
        format: CaptionFormat.SRT,
        ingredient: 'ckz1234567890abcdefghi',
        language: 'en',
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'ingredientId')).toBe(
        true,
      );
    });
  });
});
