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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new OptimalTimeDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
