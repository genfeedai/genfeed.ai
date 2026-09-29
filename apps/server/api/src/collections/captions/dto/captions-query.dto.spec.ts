import { CaptionsQueryDto } from '@api/collections/captions/dto/captions-query.dto';

describe('CaptionsQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CaptionsQueryDto();
      expect(dto).toBeInstanceOf(CaptionsQueryDto);
    });
  });
});
