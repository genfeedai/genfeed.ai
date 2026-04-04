import { QuickAddWatchlistsDto } from '@api/collections/watchlists/dto/quick-add-watchlist.dto';

describe('QuickAddWatchlistsDto', () => {
  it('should be defined', () => {
    expect(QuickAddWatchlistsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new QuickAddWatchlistsDto();
      expect(dto).toBeInstanceOf(QuickAddWatchlistsDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new QuickAddWatchlistDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
