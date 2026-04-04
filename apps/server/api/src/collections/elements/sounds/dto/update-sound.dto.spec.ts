import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';

describe('UpdateElementSoundDto', () => {
  it('should be defined', () => {
    expect(UpdateElementSoundDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementSoundDto();
      expect(dto).toBeInstanceOf(UpdateElementSoundDto);
    });
  });
});
