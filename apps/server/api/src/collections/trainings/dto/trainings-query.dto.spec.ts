import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import { plainToInstance } from 'class-transformer';

describe('TrainingsQueryDto', () => {
  describe('validation', () => {
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
