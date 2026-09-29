import { VoiceEntity } from '@api/collections/voices/entities/voice.entity';

describe('VoiceEntity', () => {
  it('should create an instance', () => {
    const entity = new VoiceEntity();
    expect(entity).toBeInstanceOf(VoiceEntity);
  });
});
