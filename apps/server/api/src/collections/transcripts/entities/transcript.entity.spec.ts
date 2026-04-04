import { TranscriptEntity } from '@api/collections/transcripts/entities/transcript.entity';

describe('TranscriptEntity', () => {
  it('should be defined', () => {
    expect(TranscriptEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new TranscriptEntity();
    expect(entity).toBeInstanceOf(TranscriptEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new TranscriptEntity();
  //     // Test properties
  //   });
  // });
});
