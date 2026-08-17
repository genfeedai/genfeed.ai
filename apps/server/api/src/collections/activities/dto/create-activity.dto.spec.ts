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
  });
});
