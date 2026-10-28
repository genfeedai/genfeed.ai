import {
  classifyOwnerEmail,
  readDraftsStatus,
  readPrefillMarker,
  summarizeOnboardingFunnel,
} from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.util';
import type { IOnboardingFunnelOrganization } from '@genfeedai/contracts/interfaces';

function organization(
  overrides: Partial<IOnboardingFunnelOrganization> = {},
): IOnboardingFunnelOrganization {
  return {
    createdAt: '2026-10-20T00:00:00.000Z',
    draftsStatus: null,
    emailClass: 'personal',
    id: 'org',
    scanStatus: null,
    steps: {
      accountConnected: false,
      brandScanned: false,
      completed: false,
      draftsReady: false,
      draftsStarted: false,
      published: false,
      websiteLink: false,
    },
    ...overrides,
  };
}

describe('classifyOwnerEmail', () => {
  it.each([
    ['owner@gmail.com', 'personal'],
    ['Owner@Outlook.com', 'personal'],
    ['founder@acme.co', 'company'],
    ['not-an-email', 'unknown'],
    [null, 'unknown'],
  ])('classifies %s as %s', (email, expected) => {
    expect(classifyOwnerEmail(email)).toBe(expected);
  });
});

describe('readPrefillMarker', () => {
  it('reads the saved scan status and whether a site was scraped', () => {
    expect(
      readPrefillMarker({
        signupPrefill: { hasScrapedWebsite: true, status: 'completed' },
      }),
    ).toEqual({ hasScrapedWebsite: true, status: 'completed' });
  });

  it('treats a missing or malformed marker as no scan', () => {
    const none = { hasScrapedWebsite: false, status: null };
    expect(readPrefillMarker({})).toEqual(none);
    expect(readPrefillMarker(null)).toEqual(none);
    expect(readPrefillMarker({ signupPrefill: 'running' })).toEqual(none);
  });
});

describe('readDraftsStatus', () => {
  it('reads the result status of an onboarding run', () => {
    expect(readDraftsStatus({ result: { status: 'partial' } })).toBe('partial');
    expect(readDraftsStatus({ result: null })).toBeNull();
    expect(readDraftsStatus(undefined)).toBeNull();
  });
});

describe('summarizeOnboardingFunnel', () => {
  it('counts each step per email class and in total', () => {
    const { byEmailClass, totals } = summarizeOnboardingFunnel([
      organization({ id: 'a' }),
      organization({
        id: 'b',
        steps: {
          accountConnected: false,
          brandScanned: false,
          completed: false,
          draftsReady: true,
          draftsStarted: true,
          published: false,
          websiteLink: false,
        },
      }),
      organization({
        emailClass: 'company',
        id: 'c',
        steps: {
          accountConnected: true,
          brandScanned: true,
          completed: true,
          draftsReady: true,
          draftsStarted: true,
          published: true,
          websiteLink: true,
        },
      }),
    ]);

    expect(totals.total).toBe(3);
    expect(totals.steps).toEqual({
      accountConnected: 1,
      brandScanned: 1,
      completed: 1,
      draftsReady: 2,
      draftsStarted: 2,
      published: 1,
      websiteLink: 1,
    });
    expect(byEmailClass.personal.total).toBe(2);
    expect(byEmailClass.personal.steps.draftsReady).toBe(1);
    expect(byEmailClass.company.steps.completed).toBe(1);
    expect(byEmailClass.unknown.total).toBe(0);
  });
});
