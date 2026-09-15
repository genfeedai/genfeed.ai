import 'reflect-metadata';

import { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

const VALID_ID = '123e4567-e89b-12d3-a456-426614174000';

function basePayload(): Record<string, unknown> {
  return {
    brandId: VALID_ID,
    modelKey: 'provider/model-x',
    prompt: 'A futuristic city at sunset',
    type: 'image',
  };
}

describe('CreateAgentStudioHandoffDto', () => {
  it('accepts a minimal valid payload', async () => {
    const dto = plainToInstance(CreateAgentStudioHandoffDto, basePayload());
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('accepts a full payload at the field-length ceilings', async () => {
    const dto = plainToInstance(CreateAgentStudioHandoffDto, {
      ...basePayload(),
      aspectRatio: '16:9',
      avatarPhotoUrl: `https://cdn.test/${'a'.repeat(2000)}.png`,
      duration: 8,
      outputs: 4,
      prompt: 'p'.repeat(8000),
      references: Array.from({ length: 20 }, () => VALID_ID),
      resolution: '1080p',
      voiceId: 'v'.repeat(200),
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  // #4716 re-review P3: an unbounded prompt/reference list would otherwise
  // sit in Redis, unvalidated, for the handoff's 10-minute TTL.
  it('rejects a prompt over the length ceiling', async () => {
    const dto = plainToInstance(CreateAgentStudioHandoffDto, {
      ...basePayload(),
      prompt: 'p'.repeat(8001),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'prompt')).toBe(true);
  });

  it('rejects more references than the ceiling allows', async () => {
    const dto = plainToInstance(CreateAgentStudioHandoffDto, {
      ...basePayload(),
      references: Array.from({ length: 21 }, () => VALID_ID),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'references')).toBe(true);
  });

  it('rejects an overlong modelKey, avatarPhotoUrl, and voiceId', async () => {
    const modelKeyErrors = await validate(
      plainToInstance(CreateAgentStudioHandoffDto, {
        ...basePayload(),
        modelKey: 'm'.repeat(201),
      }),
    );
    expect(modelKeyErrors.some((error) => error.property === 'modelKey')).toBe(
      true,
    );

    const avatarErrors = await validate(
      plainToInstance(CreateAgentStudioHandoffDto, {
        ...basePayload(),
        avatarPhotoUrl: `https://cdn.test/${'a'.repeat(2049)}.png`,
      }),
    );
    expect(
      avatarErrors.some((error) => error.property === 'avatarPhotoUrl'),
    ).toBe(true);

    const voiceErrors = await validate(
      plainToInstance(CreateAgentStudioHandoffDto, {
        ...basePayload(),
        voiceId: 'v'.repeat(201),
      }),
    );
    expect(voiceErrors.some((error) => error.property === 'voiceId')).toBe(
      true,
    );
  });
});
