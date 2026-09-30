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
  });
});
