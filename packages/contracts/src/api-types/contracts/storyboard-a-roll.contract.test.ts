import { describe, expect, it } from 'vitest';
import { MODEL_KEYS } from '../../constants/model-keys.constant';
import {
  STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS,
  STORYBOARD_A_ROLL_MODEL_KEY,
  storyboardARollSchema,
} from './storyboard-a-roll.contract';

function chunk(ordinal: number, text = 'Hello all.') {
  return {
    id: `1111111${ordinal}-1111-4111-8111-111111111111`,
    ordinal,
    pieces: [{ segmentId: 'segment-1', start: 0, end: text.length }],
    text,
    fingerprint: 'a'.repeat(64),
    estimatedSeconds: 1,
    state: 'pending',
    actorUserId: 'user-1',
    credits: 0,
    billingMode: 'byok',
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  };
}

describe('storyboard A-roll contract', () => {
  it('renders with HeyGen Avatar IV under the lower documented script limit', () => {
    expect(STORYBOARD_A_ROLL_MODEL_KEY).toBe(MODEL_KEYS.HEYGEN_AVATAR_IV);
    expect(STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS).toBe(1_500);
  });

  it('accepts chunks in order', () => {
    expect(
      storyboardARollSchema.safeParse({
        presenterId: 'presenter',
        modelKey: STORYBOARD_A_ROLL_MODEL_KEY,
        chunks: [chunk(1), chunk(2)],
      }).success,
    ).toBe(true);
  });

  it('rejects out-of-order chunks and oversized scripts', () => {
    expect(
      storyboardARollSchema.safeParse({
        presenterId: 'presenter',
        modelKey: STORYBOARD_A_ROLL_MODEL_KEY,
        chunks: [chunk(2)],
      }).success,
    ).toBe(false);
    expect(
      storyboardARollSchema.safeParse({
        presenterId: 'presenter',
        modelKey: STORYBOARD_A_ROLL_MODEL_KEY,
        chunks: [
          chunk(1, 'a'.repeat(STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS + 1)),
        ],
      }).success,
    ).toBe(false);
  });
});
