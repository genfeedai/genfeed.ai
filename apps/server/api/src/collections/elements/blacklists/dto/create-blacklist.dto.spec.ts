import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';

describe('CreateElementBlacklistDto', () => {
  it('should be defined', () => {
    expect(CreateElementBlacklistDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementBlacklistDto();
      expect(dto).toBeInstanceOf(CreateElementBlacklistDto);
    });
  });
});
