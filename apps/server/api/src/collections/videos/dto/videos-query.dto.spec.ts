import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { plainToInstance } from 'class-transformer';

describe('VideosQueryDto', () => {
  describe('validation', () => {
    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(VideosQueryDto, {
        status: ['generated', 'processing'],
      });

      expect(dto.status).toEqual(['generated', 'processing']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(VideosQueryDto, {
        status: 'generated',
      });

      expect(dto.status).toEqual(['generated']);
    });
  });
});
