import { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ModelCategory } from '@genfeedai/contracts';

describe('ModelsQueryDto', () => {
  it('should be defined', () => {
    expect(ModelsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ModelsQueryDto();
      expect(dto).toBeInstanceOf(ModelsQueryDto);
    });

    it('parses comma-separated categories', async () => {
      const dto = (await new ValidationPipe().transform(
        { categories: 'image, image-edit,image-upscale' },
        { metatype: ModelsQueryDto, type: 'query' },
      )) as ModelsQueryDto;

      expect(dto.categories).toEqual([
        ModelCategory.IMAGE,
        ModelCategory.IMAGE_EDIT,
        ModelCategory.IMAGE_UPSCALE,
      ]);
    });

    it('rejects an unknown category in the list', async () => {
      await expect(
        new ValidationPipe().transform(
          { categories: 'image,not-a-category' },
          { metatype: ModelsQueryDto, type: 'query' },
        ),
      ).rejects.toThrow();
    });
  });
});
