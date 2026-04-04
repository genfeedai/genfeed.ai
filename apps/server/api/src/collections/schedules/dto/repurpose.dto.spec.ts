import { RepurposeContentDto } from '@api/collections/schedules/dto/repurpose.dto';

describe('RepurposeContentDto', () => {
  it('should be defined', () => {
    expect(RepurposeContentDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new RepurposeContentDto();
      expect(dto).toBeInstanceOf(RepurposeContentDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new RepurposeDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
