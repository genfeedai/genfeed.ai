import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';

describe('UpdateWatchlistDto', () => {
  it('should be defined', () => {
    expect(UpdateWatchlistDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateWatchlistDto();
      expect(dto).toBeInstanceOf(UpdateWatchlistDto);
    });
  });
});
