vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { BadRequestException } from '@nestjs/common';

describe('AgentCampaignsService tenant boundaries', () => {
  const brandFindFirst = vi.fn();
  const campaignCreate = vi.fn();
  const campaignFindFirst = vi.fn();
  const campaignUpdate = vi.fn();
  const strategyFindMany = vi.fn();
  const createStrategyWithClient = vi.fn();
  const transactionClient = {
    agentCampaign: {
      create: campaignCreate,
      findFirst: campaignFindFirst,
      update: campaignUpdate,
    },
    agentStrategy: { findMany: strategyFindMany },
    brand: { findFirst: brandFindFirst },
  };
  const prisma = {
    ...transactionClient,
    $transaction: vi.fn(
      async (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    ),
  };
  const service = new AgentCampaignsService(
    prisma as never,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as never,
    { createWithClient: createStrategyWithClient } as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
    campaignCreate.mockResolvedValue({
      agents: [
        { id: 'created-agent-1' },
        { id: 'created-agent-2' },
        { id: 'created-agent-3' },
        { id: 'created-agent-4' },
      ],
      config: {},
      id: 'program-1',
    });
    campaignUpdate.mockResolvedValue({
      agents: [{ id: 'deleted-agent' }],
      brandId: 'brand-1',
      config: {},
      id: 'program-1',
      organizationId: 'org-1',
      status: 'completed',
    });
    strategyFindMany.mockResolvedValue([]);
    createStrategyWithClient
      .mockResolvedValueOnce({ id: 'created-agent-1' })
      .mockResolvedValueOnce({ id: 'created-agent-2' })
      .mockResolvedValueOnce({ id: 'created-agent-3' })
      .mockResolvedValueOnce({ id: 'created-agent-4' });
  });

  it('creates the template agents and draft Program in one transaction', async () => {
    const result = await service.createFromTemplate({
      brandId: 'brand-1',
      label: 'Creator Studio Program',
      organizationId: 'org-1',
      startDate: new Date('2026-08-20'),
      templateId: 'creator-studio',
      userId: 'user-1',
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(createStrategyWithClient).toHaveBeenCalledTimes(4);
    for (const [strategyInput] of createStrategyWithClient.mock.calls) {
      expect(strategyInput).toEqual(
        expect.objectContaining({
          brandId: 'brand-1',
          isActive: false,
          organizationId: 'org-1',
        }),
      );
      expect(strategyInput).not.toHaveProperty('nextRunAt');
    }
    expect(campaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agents: {
            connect: [
              { id: 'created-agent-1' },
              { id: 'created-agent-2' },
              { id: 'created-agent-3' },
              { id: 'created-agent-4' },
            ],
          },
          brandId: 'brand-1',
          organizationId: 'org-1',
          status: 'draft',
          userId: 'user-1',
        }),
      }),
    );
    expect(result.agents).toEqual([
      'created-agent-1',
      'created-agent-2',
      'created-agent-3',
      'created-agent-4',
    ]);
  });

  it('rejects a brand outside the authenticated organization before writing', async () => {
    brandFindFirst.mockResolvedValue(null);

    await expect(
      service.createFromTemplate({
        brandId: 'foreign-brand',
        label: 'Creator Studio Program',
        organizationId: 'org-1',
        startDate: new Date('2026-08-20'),
        templateId: 'creator-studio',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createStrategyWithClient).not.toHaveBeenCalled();
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('rejects existing agents outside the selected organization and brand', async () => {
    strategyFindMany.mockResolvedValue([{ id: 'agent-1' }]);

    await expect(
      service.createFromTemplate({
        agentStrategyIds: ['agent-1', 'foreign-agent'],
        brandId: 'brand-1',
        label: 'Creator Studio Program',
        organizationId: 'org-1',
        startDate: new Date('2026-08-20'),
        templateId: 'creator-studio',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(strategyFindMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: { in: ['agent-1', 'foreign-agent'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(createStrategyWithClient).not.toHaveBeenCalled();
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('rejects a patched lead that is not attached to the Program', async () => {
    campaignFindFirst.mockResolvedValue({
      agents: [{ id: 'agent-1' }],
      brandId: 'brand-1',
      campaignLeadStrategyId: 'agent-1',
      config: {},
      id: 'program-1',
      organizationId: 'org-1',
    });

    await expect(
      service.patch('program-1', {
        campaignLeadStrategyId: 'foreign-agent',
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('allows routine status updates when an existing agent is unavailable', async () => {
    campaignFindFirst.mockResolvedValue({
      agents: [{ id: 'deleted-agent' }],
      brandId: 'brand-1',
      campaignLeadStrategyId: 'deleted-agent',
      config: {},
      id: 'program-1',
      organizationId: 'org-1',
    });

    await service.patch('program-1', {
      organizationId: 'org-1',
      status: 'completed',
    });

    expect(brandFindFirst).not.toHaveBeenCalled();
    expect(strategyFindMany).not.toHaveBeenCalled();
    expect(campaignUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'completed' }),
      where: {
        id: 'program-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('rejects updates without an explicit organization scope', async () => {
    await expect(
      service.patch('program-1', { status: 'completed' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(campaignFindFirst).not.toHaveBeenCalled();
    expect(campaignUpdate).not.toHaveBeenCalled();
  });
});
