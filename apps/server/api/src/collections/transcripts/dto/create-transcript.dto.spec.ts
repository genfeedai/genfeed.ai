import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';

describe('CreateTranscriptDto', () => {
  it('should be defined', () => {
    expect(CreateTranscriptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTranscriptDto();
      expect(dto).toBeInstanceOf(CreateTranscriptDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTranscriptDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
