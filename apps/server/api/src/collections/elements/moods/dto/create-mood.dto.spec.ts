import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';

describe('CreateElementMoodDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementMoodDto();
      expect(dto).toBeInstanceOf(CreateElementMoodDto);
    });
  });
});
