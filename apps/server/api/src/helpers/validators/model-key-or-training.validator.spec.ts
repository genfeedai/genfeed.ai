import 'reflect-metadata';

import { IsModelKeyOrTraining } from '@api/helpers/validators/model-key-or-training.validator';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

class ModelHolder {
  @IsModelKeyOrTraining()
  model?: unknown;
}

async function messagesFor(model: unknown) {
  const holder = new ModelHolder();
  holder.model = model;
  const errors = await validate(holder);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('IsModelKeyOrTraining', () => {
  it('allows empty values, known keys, destinations, and version ids', async () => {
    await expect(messagesFor(undefined)).resolves.toEqual([]);
    await expect(messagesFor('')).resolves.toEqual([]);
    await expect(
      messagesFor(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3),
    ).resolves.toEqual([]);
    await expect(
      messagesFor('replicate/fast-flux-trainer:abc'),
    ).resolves.toEqual([]);
    await expect(messagesFor('owner/model:v1')).resolves.toEqual([]);
    await expect(messagesFor('aaaaaaaaaaaaaaaaaaaaaaaaa')).resolves.toEqual([]);
  });

  it('rejects non-strings and unknown model identifiers', async () => {
    await expect(messagesFor(12)).resolves.toEqual([
      'model must be a known ModelKey, a Replicate destination (owner/model[:version]) or a Replicate version id',
    ]);
    await expect(messagesFor('not-a-model')).resolves.toEqual([
      'model must be a known ModelKey, a Replicate destination (owner/model[:version]) or a Replicate version id',
    ]);
  });
});
