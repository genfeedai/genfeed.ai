import { GifsQueryDto } from '@api/collections/gifs/dto/gifs-query.dto';
import { plainToInstance } from 'class-transformer';

describe('GifsQueryDto', () => {
  it('should be defined', () => {
    expect(GifsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GifsQueryDto();
      expect(dto).toBeInstanceOf(GifsQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(GifsQueryDto, {
        status: ['generated', 'processing'],
      });

      expect(dto.status).toEqual(['generated', 'processing']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(GifsQueryDto, {
        status: 'generated',
      });

      expect(dto.status).toEqual(['generated']);
    });
  });
});
