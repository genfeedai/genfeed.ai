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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BaseQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
