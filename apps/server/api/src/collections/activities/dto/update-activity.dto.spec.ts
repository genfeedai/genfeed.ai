import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';

describe('UpdateActivityDto', () => {
  it('should be defined', () => {
    expect(UpdateActivityDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateActivityDto();
      expect(dto).toBeInstanceOf(UpdateActivityDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateActivityDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
