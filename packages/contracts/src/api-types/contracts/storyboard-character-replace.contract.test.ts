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
  it('roundtrips unknown-ID and optional historical evidence', () => {
    const input = {
      operations: [receipt],
      legacyReplacements: [
        {
          ...receipt,
          acceptedRequestIds: undefined,
          runId: undefined,
          requestId: 'historical',
          prompt: 'Walk',
          output: {
            kind: 'provider_url',
            url: 'https://fixture.invalid/result',
            retained: false,
          },
        },
      ],
    };
    const {
      acceptedRequestIds: _ids,
      runId: _run,
      ...legacy
    } = input.legacyReplacements[0];
    const value = { ...input, legacyReplacements: [legacy] };
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
        legacyReplacements: [],
      }).success,
    ).toBe(false);
  });
  it('enforces complete bounded arrays and strict envelope', () => {
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: Array(128).fill(receipt),
        legacyReplacements: [],
      }).success,
    ).toBe(true);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: Array(129).fill(receipt),
        legacyReplacements: [],
      }).success,
    ).toBe(false);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: [],
        legacyReplacements: [],
        journal: [],
      }).success,
    ).toBe(false);
    expect(
      storyboardCharacterReplacementsSchema.safeParse({
        operations: [{ ...receipt, status: 'invented' }],
        legacyReplacements: [],
      }).success,
    ).toBe(false);
  });
});
