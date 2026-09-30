import { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { plainToInstance } from 'class-transformer';

describe('MusicQueryDto', () => {
  it('should be defined', () => {
    expect(MusicQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new MusicQueryDto();
      expect(dto).toBeInstanceOf(MusicQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(MusicQueryDto, {
        status: ['generated', 'processing'],
      });

      expect(dto.status).toEqual(['generated', 'processing']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(MusicQueryDto, {
        status: 'generated',
      });

      expect(dto.status).toEqual(['generated']);
    });
  });
});
