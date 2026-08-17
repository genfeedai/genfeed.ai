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
  });
});
