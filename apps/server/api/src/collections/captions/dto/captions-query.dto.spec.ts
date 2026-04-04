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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CaptionsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
