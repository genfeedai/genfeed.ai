import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';

describe('CreateElementSoundDto', () => {
  it('should be defined', () => {
    expect(CreateElementSoundDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementSoundDto();
      expect(dto).toBeInstanceOf(CreateElementSoundDto);
    });
  });
});
