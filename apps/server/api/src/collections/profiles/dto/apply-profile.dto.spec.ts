import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';

describe('ApplyProfileDto', () => {
  it('should be defined', () => {
    expect(ApplyProfileDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ApplyProfileDto();
      expect(dto).toBeInstanceOf(ApplyProfileDto);
    });
  });
});
