import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';

describe('UpdateElementBlacklistDto', () => {
  it('should be defined', () => {
    expect(UpdateElementBlacklistDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementBlacklistDto();
      expect(dto).toBeInstanceOf(UpdateElementBlacklistDto);
    });
  });
});
