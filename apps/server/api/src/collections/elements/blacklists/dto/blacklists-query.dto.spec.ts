import { BlacklistsQueryDto } from '@api/collections/elements/blacklists/dto/blacklists-query.dto';

describe('BlacklistsQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BlacklistsQueryDto();
      expect(dto).toBeInstanceOf(BlacklistsQueryDto);
    });
  });
});
