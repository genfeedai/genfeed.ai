import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';

describe('TrackClickDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new TrackClickDto();
      expect(dto).toBeInstanceOf(TrackClickDto);
    });
  });
});
