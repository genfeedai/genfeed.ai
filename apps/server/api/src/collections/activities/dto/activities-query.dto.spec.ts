import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';

describe('ActivitiesQueryDto', () => {
  it('should be defined', () => {
    expect(ActivitiesQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ActivitiesQueryDto();
      expect(dto).toBeInstanceOf(ActivitiesQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ActivitiesQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
