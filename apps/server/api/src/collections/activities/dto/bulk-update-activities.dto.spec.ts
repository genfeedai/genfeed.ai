import { BulkUpdateActivitiesDto } from '@api/collections/activities/dto/bulk-update-activities.dto';

describe('BulkUpdateActivitiesDto', () => {
  it('should be defined', () => {
    expect(BulkUpdateActivitiesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BulkUpdateActivitiesDto();
      expect(dto).toBeInstanceOf(BulkUpdateActivitiesDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BulkUpdateActivitiesDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
