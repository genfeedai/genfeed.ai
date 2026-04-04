import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';

describe('CreateWatchlistDto', () => {
  it('should be defined', () => {
    expect(CreateWatchlistDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateWatchlistDto();
      expect(dto).toBeInstanceOf(CreateWatchlistDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateWatchlistDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
