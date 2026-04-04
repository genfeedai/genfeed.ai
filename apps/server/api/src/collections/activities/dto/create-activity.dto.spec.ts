import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';

describe('CreateActivityDto', () => {
  it('should be defined', () => {
    expect(CreateActivityDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateActivityDto();
      expect(dto).toBeInstanceOf(CreateActivityDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateActivityDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
