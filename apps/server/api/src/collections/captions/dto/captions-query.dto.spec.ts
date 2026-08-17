import { CaptionsQueryDto } from '@api/collections/captions/dto/captions-query.dto';

describe('CaptionsQueryDto', () => {
  it('should be defined', () => {
    expect(CaptionsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CaptionsQueryDto();
      expect(dto).toBeInstanceOf(CaptionsQueryDto);
    });
  });
});
