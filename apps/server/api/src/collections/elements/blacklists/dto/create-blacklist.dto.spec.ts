import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';

describe('CreateElementBlacklistDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementBlacklistDto();
      expect(dto).toBeInstanceOf(CreateElementBlacklistDto);
    });
  });
});
