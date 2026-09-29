import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';

describe('GetOptimalTimeDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GetOptimalTimeDto();
      expect(dto).toBeInstanceOf(GetOptimalTimeDto);
    });
  });
});
