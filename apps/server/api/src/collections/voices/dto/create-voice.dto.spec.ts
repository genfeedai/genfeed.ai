import { CreateVoiceDto } from '@api/collections/voices/dto/create-voice.dto';

describe('CreateVoiceDto', () => {
  it('should be defined', () => {
    expect(CreateVoiceDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVoiceDto();
      expect(dto).toBeInstanceOf(CreateVoiceDto);
    });
  });
});
