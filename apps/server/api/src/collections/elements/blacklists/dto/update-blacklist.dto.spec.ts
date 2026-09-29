import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';

describe('UpdateElementBlacklistDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementBlacklistDto();
      expect(dto).toBeInstanceOf(UpdateElementBlacklistDto);
    });
  });
});
