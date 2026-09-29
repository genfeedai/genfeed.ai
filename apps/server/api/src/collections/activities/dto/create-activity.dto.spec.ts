import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';

describe('CreateActivityDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateActivityDto();
      expect(dto).toBeInstanceOf(CreateActivityDto);
    });
  });
});
