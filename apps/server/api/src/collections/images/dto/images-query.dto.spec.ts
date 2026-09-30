import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { plainToInstance } from 'class-transformer';

describe('ImagesQueryDto', () => {
  it('should be defined', () => {
    expect(ImagesQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ImagesQueryDto();
      expect(dto).toBeInstanceOf(ImagesQueryDto);
    });

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
