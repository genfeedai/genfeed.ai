import { UpdateVoiceDto } from '@api/collections/voices/dto/update-voice.dto';

describe('UpdateVoiceDto', () => {
  it('should be defined', () => {
    expect(UpdateVoiceDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateVoiceDto();
      expect(dto).toBeInstanceOf(UpdateVoiceDto);
    });
  });
});
