import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import {
  buildBrandSystemPrompt,
  isPlaceholderBrandText,
  PLACEHOLDER_BRAND_DESCRIPTION,
} from './brand-system-prompt.util';

function buildScrapedData(
  overrides: Partial<IScrapedBrandData> = {},
): IScrapedBrandData {
  return {
    scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceUrl: 'https://acme.com',
    ...overrides,
  };
}

describe('isPlaceholderBrandText', () => {
  it('treats empty and provisioning-placeholder copy as absent', () => {
    expect(isPlaceholderBrandText(undefined)).toBe(true);
    expect(isPlaceholderBrandText(null)).toBe(true);
    expect(isPlaceholderBrandText('   ')).toBe(true);
    expect(isPlaceholderBrandText(PLACEHOLDER_BRAND_DESCRIPTION)).toBe(true);
  });

  it('leaves real copy alone', () => {
    expect(isPlaceholderBrandText('We write for operators.')).toBe(false);
  });
});

describe('buildBrandSystemPrompt', () => {
  it('always names the brand, even with nothing else to go on', () => {
    expect(buildBrandSystemPrompt('Acme', {})).toBe(
      'You are creating content for Acme.',
    );
  });

  it('folds the scrape and the analyzed voice into one pre-prompt', () => {
    const prompt = buildBrandSystemPrompt(
      'Acme',
      {
        strategy: { platforms: ['linkedin'] },
        voice: {
          audience: ['founders'],
          bannedPhrases: ['game-changer'],
          messagingPillars: ['speed'],
          style: 'plain',
          tone: 'direct',
        },
      },
      buildScrapedData({
        description: 'Automation for operators.',
        tagline: 'Ship faster.',
        valuePropositions: ['No setup'],
      }),
    );

    expect(prompt).toContain('You are creating content for Acme.');
    expect(prompt).toContain('About the brand: Automation for operators.');
    expect(prompt).toContain('Brand tagline: "Ship faster."');
    expect(prompt).toContain('Voice: direct, plain.');
    expect(prompt).toContain('Audience: founders.');
    expect(prompt).toContain('Messaging pillars: speed.');
    expect(prompt).toContain('What the brand promises: No setup.');
    expect(prompt).toContain('Primary channels: linkedin.');
    expect(prompt).toContain('Never use: game-changer.');
  });

  it('falls back to hero copy when the site had no description', () => {
    const prompt = buildBrandSystemPrompt(
      'Acme',
      {},
      buildScrapedData({ heroText: 'Automation that ships itself.' }),
    );

    expect(prompt).toContain('About the brand: Automation that ships itself.');
  });

  it('omits sections it has no signal for', () => {
    const prompt = buildBrandSystemPrompt('Acme', {
      voice: { tone: 'direct' },
    });

    expect(prompt).toContain('Voice: direct.');
    expect(prompt).not.toContain('Audience:');
    expect(prompt).not.toContain('Primary channels:');
  });

  it('trims string lists and omits blank values', () => {
    const prompt = buildBrandSystemPrompt('Acme', {
      voice: {
        audience: ['  founders  ', '   '],
        messagingPillars: ['  speed  ', ''],
      },
    });

    expect(prompt).toContain('Audience: founders.');
    expect(prompt).toContain('Messaging pillars: speed.');
  });
});
