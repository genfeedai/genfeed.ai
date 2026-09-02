import {
  buildProactiveBrandSystemPrompt,
  buildProactiveWorkspaceSummary,
  getProactivePrepPercent,
  getProactivePrepStage,
  isProactiveInviteEligible,
} from '@api/endpoints/onboarding/services/proactive-onboarding-value.util';
import { ProactiveOnboardingStatus } from '@genfeedai/contracts';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

describe('proactive onboarding value helpers', () => {
  it.each([
    [ProactiveOnboardingStatus.BRAND_PREPARING, 'researching_brand', 25],
    [ProactiveOnboardingStatus.BRAND_READY, 'brand_ready', 55],
    [ProactiveOnboardingStatus.CONTENT_GENERATING, 'generating_outputs', 80],
    [ProactiveOnboardingStatus.CONTENT_READY, 'ready', 100],
    [ProactiveOnboardingStatus.READY, 'ready', 100],
    [ProactiveOnboardingStatus.INVITED, 'ready', 100],
    [ProactiveOnboardingStatus.STARTED, 'ready', 100],
    [ProactiveOnboardingStatus.PAYMENT_MADE, 'ready', 100],
    [ProactiveOnboardingStatus.CONVERTED, 'ready', 100],
    [undefined, 'not_started', 0],
  ])(
    'maps %s to its preparation stage and percentage',
    (status, expectedStage, expectedPercent) => {
      expect(getProactivePrepStage(status)).toBe(expectedStage);
      expect(getProactivePrepPercent(status)).toBe(expectedPercent);
    },
  );

  it.each([
    ProactiveOnboardingStatus.CONTENT_READY,
    ProactiveOnboardingStatus.READY,
    ProactiveOnboardingStatus.INVITED,
    ProactiveOnboardingStatus.STARTED,
    ProactiveOnboardingStatus.PAYMENT_MADE,
    ProactiveOnboardingStatus.CONVERTED,
  ])('marks %s as invitation-eligible', (status) => {
    expect(isProactiveInviteEligible(status)).toBe(true);
  });

  it('rejects incomplete preparation states for invitations', () => {
    expect(
      isProactiveInviteEligible(ProactiveOnboardingStatus.BRAND_READY),
    ).toBe(false);
    expect(isProactiveInviteEligible(undefined)).toBe(false);
  });

  it('builds the workspace summary from the available context', () => {
    expect(
      buildProactiveWorkspaceSummary(
        {
          brand: { colors: [], id: 'brand-1', name: 'Acme' },
          organization: { id: 'org-1', label: 'Acme Workspace' },
        },
        3,
      ),
    ).toBe(
      'Acme Workspace is prebuilt with Acme context and 3 starter outputs ready.',
    );

    expect(buildProactiveWorkspaceSummary({}, 0)).toBe(
      'Your workspace is prebuilt.',
    );
  });

  it('builds the brand system prompt without empty sections', () => {
    expect(
      buildProactiveBrandSystemPrompt(
        {
          aboutText: 'Useful products for busy teams.',
          companyName: 'Acme',
          scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
          socialLinks: {},
          sourceUrl: 'https://acme.example',
          tagline: 'Ship faster',
          valuePropositions: [],
        } as IScrapedBrandData,
        {
          brandName: 'Acme',
          brandUrl: 'https://acme.example',
          industry: 'Software',
          targetAudience: 'Founders',
        },
      ),
    ).toBe(
      'You are creating content for Acme.\n\nBrand tagline: "Ship faster"\n\nAbout the brand: Useful products for busy teams.\n\nIndustry: Software\n\nTarget audience: Founders',
    );

    expect(
      buildProactiveBrandSystemPrompt(
        {
          scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
          socialLinks: {},
          sourceUrl: 'https://acme.example',
          valuePropositions: [],
        } as IScrapedBrandData,
        {
          brandName: 'Acme',
          brandUrl: 'https://acme.example',
        },
      ),
    ).toBe('');
  });
});
