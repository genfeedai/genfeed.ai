import { UpdateVoiceDto } from '@api/collections/voices/dto/update-voice.dto';

describe('UpdateVoiceDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateVoiceDto();
      expect(dto).toBeInstanceOf(UpdateVoiceDto);
    });
  });
});
