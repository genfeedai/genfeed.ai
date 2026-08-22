import { describe, expect, it } from 'vitest';
import { AVATAR_GENERATION_CREDIT_COST } from './avatar-generation-pricing.constant';

describe('avatar generation pricing', () => {
  it('exports the fallback cost used before provider dispatch', () => {
    expect(AVATAR_GENERATION_CREDIT_COST).toBe(1);
  });
});
