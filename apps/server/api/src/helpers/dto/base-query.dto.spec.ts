import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';

describe('BaseQueryDto', () => {
  it('should be defined', () => {
    expect(BaseQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BaseQueryDto();
      expect(dto).toBeInstanceOf(BaseQueryDto);
    });
  });
});
