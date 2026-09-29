import { CreateVoiceDto } from '@api/collections/voices/dto/create-voice.dto';

describe('CreateVoiceDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVoiceDto();
      expect(dto).toBeInstanceOf(CreateVoiceDto);
    });
  });
});
