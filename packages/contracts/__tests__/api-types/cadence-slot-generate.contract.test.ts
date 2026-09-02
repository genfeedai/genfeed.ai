import { describe, expect, it } from 'vitest';
import { PostCategory } from '../../src';
import {
  buildCadenceSlotGeneratePrompt,
  MAX_SCHEDULED_CAMPAIGN_ITEMS,
  MAX_SCHEDULED_ITEM_CHARS,
  trimScheduledCampaignItems,
} from '../../src/api-types/contracts/cadence-slot-generate.contract';

function baseInput() {
  return {
    brandDescription: 'Open-source AI OS for content creation',
    brandLabel: 'Genfeed',
    brandVoice: { tone: 'direct', voice: 'operator-to-operator' },
    campaign: {
      brief: 'A YouTube Short every two hours about shipping in public',
      label: 'August shorts',
    },
    format: PostCategory.REEL,
    instant: '2026-08-20T10:00:00.000Z',
    scheduledItems: [
      {
        content: 'Morning: we shipped cadence ghosts on the calendar.',
        instant: '2026-08-20T08:00:00.000Z',
      },
    ],
    slotBrief: 'Talk about Generate filling a missing slot',
    timezone: 'UTC',
  };
}

describe('buildCadenceSlotGeneratePrompt', () => {
  it('builds a micro prompt with brand, campaign, and scheduled posts', () => {
    const prompt = buildCadenceSlotGeneratePrompt(baseInput());

    expect(prompt.system).toContain('one post for a brand campaign');
    expect(prompt.system).toContain('Return only the post body');
    expect(prompt.user).toContain('Brand: Genfeed');
    expect(prompt.user).toContain('Brand voice:');
    expect(prompt.user).toContain('Campaign: August shorts');
    expect(prompt.user).toContain(
      'Campaign brief: A YouTube Short every two hours',
    );
    expect(prompt.user).toContain('Already scheduled in this campaign:');
    expect(prompt.user).toContain('Morning: we shipped cadence ghosts');
    expect(prompt.user).toContain(
      'This slot: Talk about Generate filling a missing slot',
    );
    expect(prompt.maxTokens).toBeLessThanOrEqual(180);
  });

  it('keeps the system prompt short', () => {
    const prompt = buildCadenceSlotGeneratePrompt(baseInput());
    expect(prompt.system.split(' ').length).toBeLessThan(60);
  });

  it('asks not to repeat already scheduled campaign posts', () => {
    const prompt = buildCadenceSlotGeneratePrompt(baseInput());
    expect(prompt.system.toLowerCase()).toContain('do not repeat');
  });

  it('uses campaign fallbacks when the cadence is unnamed', () => {
    const prompt = buildCadenceSlotGeneratePrompt({
      ...baseInput(),
      campaign: { brief: null, label: null },
      scheduledItems: [],
      slotBrief: null,
    });

    expect(prompt.user).toContain('Campaign: Untitled campaign');
    expect(prompt.user).toContain(
      'Already scheduled in this campaign: none yet.',
    );
    expect(prompt.user).toContain('write the next post in the campaign');
  });

  it('caps scheduled campaign items and truncates long copy', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      content: 'x'.repeat(400),
      instant: `2026-08-20T${String(index).padStart(2, '0')}:00:00.000Z`,
    }));
    const trimmed = trimScheduledCampaignItems(items);

    expect(trimmed).toHaveLength(MAX_SCHEDULED_CAMPAIGN_ITEMS);
    expect(trimmed[0]?.content).toHaveLength(MAX_SCHEDULED_ITEM_CHARS + 3);
  });
});
