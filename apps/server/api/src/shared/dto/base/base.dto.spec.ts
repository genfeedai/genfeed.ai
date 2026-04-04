import { BaseCreateDto, BaseUpdateDto } from '@api/shared/dto/base/base.dto';

describe('BaseDto', () => {
  it('should be defined', () => {
    expect(BaseCreateDto).toBeDefined();
  });

  describe('validation', () => {
    it('should have correct prototype chain', () => {
      expect(BaseCreateDto.prototype).toBeDefined();
      expect(BaseUpdateDto.prototype).toBeDefined();
    });
  });
});
