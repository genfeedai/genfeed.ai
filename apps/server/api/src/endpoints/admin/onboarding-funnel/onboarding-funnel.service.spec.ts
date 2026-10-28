import { OnboardingFunnelService } from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('OnboardingFunnelService', () => {
  const findMany = vi.fn();
  let service: OnboardingFunnelService;

  beforeEach(async () => {
    findMany.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        OnboardingFunnelService,
        { provide: PrismaService, useValue: { organization: { findMany } } },
      ],
    }).compile();
    service = module.get(OnboardingFunnelService);
  });

  it('turns organizations into steps and email classes without exposing emails', async () => {
    findMany.mockResolvedValue([
      {
        brands: [],
        contentRuns: [],
        createdAt: new Date('2026-10-20T00:00:00.000Z'),
        credentials: [],
        id: 'org_personal',
        onboardingCompleted: false,
        posts: [],
        user: { email: 'owner@gmail.com', isOnboardingCompleted: true },
      },
      {
        brands: [
          {
            agentConfig: {
              signupPrefill: { hasScrapedWebsite: true, status: 'completed' },
            },
            links: [{ category: 'WEBSITE' }],
          },
        ],
        contentRuns: [{ config: { result: { status: 'ready' } } }],
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
        credentials: [{ id: 'cred_1' }],
        id: 'org_company',
        onboardingCompleted: true,
        posts: [{ id: 'post_1' }],
        user: { email: 'founder@acme.co', isOnboardingCompleted: true },
      },
    ]);

    const report = await service.getReport(7);

    expect(report.windowDays).toBe(7);
    expect(report.totals.total).toBe(2);
    expect(report.byEmailClass.personal.total).toBe(1);
    expect(report.organizations[1]).toMatchObject({
      draftsStatus: 'ready',
      emailClass: 'company',
      scanStatus: 'completed',
      steps: {
        accountConnected: true,
        brandScanned: true,
        completed: true,
        draftsReady: true,
        draftsStarted: true,
        published: true,
        websiteLink: true,
      },
    });
    // The classic wizard only sets the owner's flag, so that counts as completed.
    expect(report.organizations[0]?.steps).toMatchObject({
      accountConnected: false,
      completed: true,
      published: false,
    });
    expect(JSON.stringify(report)).not.toContain('@');
  });
});
