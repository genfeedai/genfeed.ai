import { VoiceEntity } from '@api/collections/voices/entities/voice.entity';

describe('VoiceEntity', () => {
  it('should be defined', () => {
    expect(VoiceEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new VoiceEntity();
    expect(entity).toBeInstanceOf(VoiceEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new VoiceEntity();
  //     // Test properties
  //   });
  // });
});
