import { UpdateTranscriptDto } from '@api/collections/transcripts/dto/update-transcript.dto';

describe('UpdateTranscriptDto', () => {
  it('should be defined', () => {
    expect(UpdateTranscriptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTranscriptDto();
      expect(dto).toBeInstanceOf(UpdateTranscriptDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateTranscriptDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
