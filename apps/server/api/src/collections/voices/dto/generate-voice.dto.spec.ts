import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('GenerateVoiceDto', () => {
  it('rejects an unbounded agent source action identity', async () => {
    const dto = plainToInstance(GenerateVoiceDto, {
      sourceActionId: 'a'.repeat(129),
      text: 'Hello',
      voiceId: 'voice-1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceActionId')).toBe(
      true,
    );
  });
});
