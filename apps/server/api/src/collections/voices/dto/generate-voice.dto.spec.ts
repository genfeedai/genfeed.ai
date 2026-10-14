import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import {
  MODEL_KEYS,
  RouterPriority,
  VoiceProvider,
} from '@genfeedai/contracts';
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

  it('accepts a speech model with its voice catalog and routing priority', async () => {
    const dto = plainToInstance(GenerateVoiceDto, {
      autoSelectModel: false,
      model: MODEL_KEYS.HEYGEN_VOICE,
      prioritize: RouterPriority.QUALITY,
      text: 'Hello',
      voiceId: 'voice-1',
      voiceProvider: VoiceProvider.HEYGEN,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each([
    ['voiceProvider', VoiceProvider.HEDRA],
    ['prioritize', 'fastest'],
  ])('rejects an unsupported %s', async (property, value) => {
    const dto = plainToInstance(GenerateVoiceDto, {
      [property]: value,
      text: 'Hello',
      voiceId: 'voice-1',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual([property]);
  });
});
