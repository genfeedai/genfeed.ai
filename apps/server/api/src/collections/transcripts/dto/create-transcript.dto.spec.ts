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
  });
});
