import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';

describe('UpdateElementStyleDto', () => {
  it('should be defined', () => {
    expect(UpdateElementStyleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementStyleDto();
      expect(dto).toBeInstanceOf(UpdateElementStyleDto);
    });
  });
});
