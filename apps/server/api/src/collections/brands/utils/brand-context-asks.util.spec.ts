import {
  BRAND_CONTEXT_ASK_PRIORITY,
  BRAND_CONTEXT_BRAND_COOLDOWN_MS,
  BRAND_CONTEXT_FIELD_COOLDOWN_MS,
  parseBrandContextAskRequestId,
  readBrandContextAsks,
  readStoredScanSuggestions,
  resolveMissingBrandContext,
  wereFieldsAskedInThread,
} from '@api/collections/brands/utils/brand-context-asks.util';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

/** Every onboarding card field filled. */
const COMPLETE_CONFIG = {
  strategy: {
    competitors: ['Rival'],
    frequency: 'weekly',
    goals: ['Drive sales'],
    offers: ['Coaching'],
    platforms: ['linkedin'],
  },
  voice: { audience: ['Founders'], tone: 'direct' },
};

function resolveFields(
  agentConfig: Record<string, unknown>,
  threadId?: string,
) {
  return resolveMissingBrandContext({
    brand: { agentConfig },
    now: NOW,
    threadId,
  }).fields;
}

describe('resolveMissingBrandContext', () => {
  it('lists every missing field in priority order: Audience, Offer, Competitors first', () => {
    expect(BRAND_CONTEXT_ASK_PRIORITY.slice(0, 3)).toEqual([
      'audience',
      'offer',
      'competitors',
    ]);
    expect(resolveFields({}).map((entry) => entry.field)).toEqual([
      'audience',
      'offer',
      'competitors',
      'goals',
      'platforms',
      'tone',
      'cadence',
    ]);
  });

  it('omits fields the brand already has, whether answered in onboarding or set elsewhere', () => {
    expect(resolveFields(COMPLETE_CONFIG)).toEqual([]);
    expect(
      resolveFields({
        strategy: { offers: ['Coaching'] },
        voice: { audience: ['Founders'] },
        onboardingAnswers: {
          fields: {
            offer: { status: 'answered', updatedAt: ago(HOUR_MS) },
          },
        },
      }).map((entry) => entry.field),
    ).toEqual(['competitors', 'goals', 'platforms', 'tone', 'cadence']);
  });

  it('marks a skipped field as skipped once its cooldown passed, and missing otherwise', () => {
    const fields = resolveFields({
      ...COMPLETE_CONFIG,
      strategy: { ...COMPLETE_CONFIG.strategy, offers: [], goals: [] },
      onboardingAnswers: {
        fields: {
          offer: {
            status: 'skipped',
            updatedAt: ago(BRAND_CONTEXT_FIELD_COOLDOWN_MS + HOUR_MS),
          },
        },
      },
    });
    expect(fields).toEqual([
      { field: 'offer', status: 'skipped' },
      { field: 'goals', status: 'missing' },
    ]);
  });

  it('holds back a field skipped within the last 7 days', () => {
    expect(
      resolveFields({
        ...COMPLETE_CONFIG,
        voice: { tone: 'direct' },
        onboardingAnswers: {
          fields: { audience: { status: 'skipped', updatedAt: ago(HOUR_MS) } },
        },
      }),
    ).toEqual([]);
  });

  it('holds back a field asked within the last 7 days, then offers it again', () => {
    const config = (askedAt: string) => ({
      ...COMPLETE_CONFIG,
      voice: { tone: 'direct' },
      brandContextAsks: { audience: { askedAt, threadId: 'thread-old' } },
    });
    expect(
      resolveFields(config(ago(BRAND_CONTEXT_FIELD_COOLDOWN_MS - HOUR_MS))),
    ).toEqual([]);
    expect(
      resolveFields(config(ago(BRAND_CONTEXT_FIELD_COOLDOWN_MS + HOUR_MS))),
    ).toEqual([{ field: 'audience', status: 'missing' }]);
  });

  it('asks nothing within 24 hours of any ask on the brand', () => {
    const askedAt = ago(BRAND_CONTEXT_BRAND_COOLDOWN_MS - HOUR_MS);
    expect(
      resolveFields({
        brandContextAsks: { cadence: { askedAt, threadId: 'thread-old' } },
      }),
    ).toEqual([]);
    expect(
      resolveFields({
        brandContextAsks: {
          cadence: {
            askedAt: ago(BRAND_CONTEXT_BRAND_COOLDOWN_MS + HOUR_MS),
            threadId: 'thread-old',
          },
        },
      }).map((entry) => entry.field),
    ).not.toContain('cadence');
  });

  it('asks nothing more in a conversation that already asked, however long ago', () => {
    const agentConfig = {
      brandContextAsks: {
        cadence: {
          askedAt: ago(BRAND_CONTEXT_FIELD_COOLDOWN_MS * 2),
          threadId: 'thread-1',
        },
      },
    };
    expect(resolveFields(agentConfig, 'thread-1')).toEqual([]);
    expect(resolveFields(agentConfig, 'thread-2')).not.toEqual([]);
  });

  it('returns the stored scan suggestions alongside the fields', () => {
    expect(
      resolveMissingBrandContext({
        brand: {
          agentConfig: {
            signupPrefill: {
              status: 'completed',
              suggestions: {
                audiences: ['Gym owners'],
                offers: ['Personal training'],
                competitors: ['Rival Gym'],
              },
            },
          },
        },
        now: NOW,
      }).suggestions,
    ).toEqual({
      audiences: ['Gym owners'],
      competitors: ['Rival Gym'],
      offers: ['Personal training'],
    });
  });
});

describe('readStoredScanSuggestions', () => {
  it('keeps short single-line strings only, capped at four', () => {
    expect(
      readStoredScanSuggestions({
        signupPrefill: {
          suggestions: {
            audiences: [
              '  Gym\n owners ',
              7,
              '',
              'x'.repeat(201),
              'B',
              'C',
              'D',
              'E',
            ],
            offers: 'not a list',
          },
        },
      }),
    ).toEqual({
      audiences: ['Gym owners', 'B', 'C', 'D'],
      competitors: [],
      offers: [],
    });
    expect(readStoredScanSuggestions(null)).toEqual({
      audiences: [],
      competitors: [],
      offers: [],
    });
  });
});

describe('brand context ask records', () => {
  it('drops unknown fields and malformed entries', () => {
    expect(
      readBrandContextAsks({
        brandContextAsks: {
          audience: { askedAt: ago(0), threadId: 'thread-1' },
          offer: { askedAt: 5, threadId: 'thread-1' },
          unknown: { askedAt: ago(0), threadId: 'thread-1' },
        },
      }),
    ).toEqual({ audience: { askedAt: ago(0), threadId: 'thread-1' } });
  });

  it('parses only brand_context request ids for known fields', () => {
    expect(parseBrandContextAskRequestId('brand_context:offer')).toBe('offer');
    expect(parseBrandContextAskRequestId('brand_context:pricing')).toBeNull();
    expect(parseBrandContextAskRequestId('ask-1')).toBeNull();
  });

  it('allows an in-flow save only for fields asked in that conversation', () => {
    const agentConfig = {
      brandContextAsks: {
        audience: { askedAt: ago(0), threadId: 'thread-1' },
      },
    };
    expect(wereFieldsAskedInThread(agentConfig, 'thread-1', ['audience'])).toBe(
      true,
    );
    expect(wereFieldsAskedInThread(agentConfig, 'thread-2', ['audience'])).toBe(
      false,
    );
    expect(
      wereFieldsAskedInThread(agentConfig, 'thread-1', ['audience', 'offer']),
    ).toBe(false);
    expect(wereFieldsAskedInThread(agentConfig, 'thread-1', [])).toBe(false);
  });
});
