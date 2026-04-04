import { BotsQueryDto } from '@api/collections/bots/dto/bots-query.dto';
import { plainToInstance } from 'class-transformer';

describe('BotsQueryDto', () => {
  it('should be defined', () => {
    expect(BotsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotsQueryDto();
      expect(dto).toBeInstanceOf(BotsQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(BotsQueryDto, {
        status: ['active', 'paused'],
      });

      expect(dto.status).toEqual(['active', 'paused']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(BotsQueryDto, {
        status: 'active',
      });

      expect(dto.status).toEqual(['active']);
    });
  });
});
