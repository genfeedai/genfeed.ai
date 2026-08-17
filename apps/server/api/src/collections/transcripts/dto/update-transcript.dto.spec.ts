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
  });
});
