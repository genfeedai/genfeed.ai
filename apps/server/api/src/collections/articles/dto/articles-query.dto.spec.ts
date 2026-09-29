import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { plainToInstance } from 'class-transformer';

describe('ArticlesQueryDto', () => {
  describe('validation', () => {
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
