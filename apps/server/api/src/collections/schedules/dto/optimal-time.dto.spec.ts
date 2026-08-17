import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';

describe('GetOptimalTimeDto', () => {
  it('should be defined', () => {
    expect(GetOptimalTimeDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GetOptimalTimeDto();
      expect(dto).toBeInstanceOf(GetOptimalTimeDto);
    });
  });
});
