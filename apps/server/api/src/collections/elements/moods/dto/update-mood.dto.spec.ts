import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';

describe('UpdateElementMoodDto', () => {
  it('should be defined', () => {
    expect(UpdateElementMoodDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementMoodDto();
      expect(dto).toBeInstanceOf(UpdateElementMoodDto);
    });
  });
});
