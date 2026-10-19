import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
  storyboardCharacterReplacementsSchema,
} from './storyboard-character-replace.contract';

const receipt = {
  operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b52',
  runId: 'run',
  shotId: 'shot',
  videoAssetId: 'video',
  imageAssetIds: ['image'],
  modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
  acceptedRequestIds: [],
  association: 'detached',
  status: 'reconciling',
  chargedCredits: 0,
  limitations: ['No audio'],
};
describe('character discovery contract', () => {
  it('roundtrips a receipt without a request ID', () => {
    const value = { operations: [receipt] };
    expect(storyboardCharacterReplacementsSchema.parse(value)).toEqual(value);
    expect(
      storyboardCharacterReplacementsSchema.parse(value).operations[0]
        .requestId,
    ).toBeUndefined();
  });
  it.each([
    'body',
    'credentialFingerprint',
    'leaseToken',
    'intentHash',
    'createdAt',
  ])('rejects private receipt field %s', (key) => {
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: [{ ...receipt, [key]: 'private' }],
      }).success,
    ).toBe(false);
  });
  it('enforces complete bounded arrays and strict envelope', () => {
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: Array(128).fill(receipt),
      }).success,
    ).toBe(true);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: Array(129).fill(receipt),
      }).success,
    ).toBe(false);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: [],
        journal: [],
      }).success,
    ).toBe(false);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: [{ ...receipt, status: 'invented' }],
      }).success,
    ).toBe(false);
  });
});
