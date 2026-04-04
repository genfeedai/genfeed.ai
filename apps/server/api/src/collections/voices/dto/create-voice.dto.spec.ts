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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateVoiceDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
