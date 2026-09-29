import {
  clampReplyMaxAgeHours,
  classifyReplyIntent,
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import { describe, expect, it } from 'vitest';

describe('classifyReplyIntent', () => {
  it('detects trolls', () => {
    expect(classifyReplyIntent('this is mid garbage cope harder')).toBe(
      'troll',
    );
  });
});

describe('resolveReplyIntent', () => {
  it('honors override', () => {
    expect(resolveReplyIntent('thanks a lot', 'troll')).toBe('troll');
  });
});

describe('getReplyIntentPersona', () => {
  it('skips auto for spam', () => {
    expect(getReplyIntentPersona('spam').shouldSkipAuto).toBe(true);
    expect(getReplyIntentPersona('troll').shouldSkipAuto).toBe(false);
  });
});

describe('clampReplyMaxAgeHours', () => {
  it('defaults and caps at 48h', () => {
    expect(clampReplyMaxAgeHours(undefined)).toBe(24);
    expect(clampReplyMaxAgeHours(200)).toBe(48);
    expect(clampReplyMaxAgeHours(0)).toBe(1);
  });
});
