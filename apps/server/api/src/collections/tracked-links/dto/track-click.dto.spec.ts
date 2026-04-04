import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';

describe('TrackClickDto', () => {
  it('should be defined', () => {
    expect(TrackClickDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TrackClickDto();
      expect(dto).toBeInstanceOf(TrackClickDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new TrackClickDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
