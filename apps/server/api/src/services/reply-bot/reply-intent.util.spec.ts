import {
  clampReplyMaxAgeHours,
  classifyReplyIntent,
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import { describe, expect, it } from 'vitest';

describe('classifyReplyIntent', () => {
  it('detects thanks', () => {
    expect(classifyReplyIntent('Thanks for this — super useful')).toBe(
      'thanks',
    );
  });

  it('detects questions', () => {
    expect(classifyReplyIntent('How do you handle multi-tenant auth?')).toBe(
      'question',
    );
  });

  it('detects trolls', () => {
    expect(classifyReplyIntent('this is mid garbage cope harder')).toBe(
      'troll',
    );
  });

  it('detects spam', () => {
    expect(
      classifyReplyIntent('DM me on telegram t.me/scam check my bio'),
    ).toBe('spam');
  });

  it('defaults otherwise', () => {
    expect(
      classifyReplyIntent(
        'Shipping this week changed how we think about memory.',
      ),
    ).toBe('default');
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
