import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import { plainToInstance } from 'class-transformer';

describe('TrainingsQueryDto', () => {
  it('should be defined', () => {
    expect(TrainingsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TrainingsQueryDto();
      expect(dto).toBeInstanceOf(TrainingsQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(TrainingsQueryDto, {
        status: ['processing', 'completed'],
      });

      expect(dto.status).toEqual(['processing', 'completed']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(TrainingsQueryDto, {
        status: 'processing',
      });

      expect(dto.status).toEqual(['processing']);
    });
  });
});
