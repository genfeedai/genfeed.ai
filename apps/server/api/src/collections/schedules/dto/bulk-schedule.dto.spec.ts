import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';

describe('BulkScheduleDto', () => {
  it('should be defined', () => {
    expect(BulkScheduleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BulkScheduleDto();
      expect(dto).toBeInstanceOf(BulkScheduleDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BulkScheduleDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
