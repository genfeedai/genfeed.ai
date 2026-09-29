import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';

describe('CreateWatchlistDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateWatchlistDto();
      expect(dto).toBeInstanceOf(CreateWatchlistDto);
    });
  });
});
