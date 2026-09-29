import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { plainToInstance } from 'class-transformer';

describe('ImagesQueryDto', () => {
  describe('validation', () => {
    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(ImagesQueryDto, {
        status: ['generated', 'processing'],
      });

      expect(dto.status).toEqual(['generated', 'processing']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(ImagesQueryDto, {
        status: 'generated',
      });

      expect(dto.status).toEqual(['generated']);
    });
  });
});
