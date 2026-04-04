import { BlacklistsQueryDto } from '@api/collections/elements/blacklists/dto/blacklists-query.dto';

describe('BlacklistsQueryDto', () => {
  it('should be defined', () => {
    expect(BlacklistsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BlacklistsQueryDto();
      expect(dto).toBeInstanceOf(BlacklistsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BlacklistsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
