import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { plainToInstance } from 'class-transformer';

describe('ArticlesQueryDto', () => {
  it('should be defined', () => {
    expect(ArticlesQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ArticlesQueryDto();
      expect(dto).toBeInstanceOf(ArticlesQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(ArticlesQueryDto, {
        status: ['draft', 'published'],
      });

      expect(dto.status).toEqual(['draft', 'published']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(ArticlesQueryDto, {
        status: 'draft',
      });

      expect(dto.status).toEqual(['draft']);
    });
  });
});
