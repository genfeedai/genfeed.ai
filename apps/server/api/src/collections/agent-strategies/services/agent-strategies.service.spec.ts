vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategiesService', () => {
  let service: AgentStrategiesService;
  let findOneByIdSpy: ReturnType<typeof vi.spyOn>;
  let patchSpy: ReturnType<typeof vi.spyOn>;

  function makeStrategy(isActive: boolean): AgentStrategyDocument {
    return {
      id: 'strategy-1',
      isActive,
      organizationId: 'org-1',
    } as unknown as AgentStrategyDocument;
  }

  beforeEach(() => {
    service = new AgentStrategiesService(
      {} as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );

    patchSpy = vi
      .spyOn(service, 'patch')
      .mockImplementation(async (_id, data) => data as AgentStrategyDocument);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes required arrays for legacy rows with sparse config', async () => {
    const create = vi.fn().mockResolvedValue({
      config: {},
      id: 'strategy-1',
      policies: {},
      platforms: [],
    });

    const strategy = await service.createWithClient(
      {
        label: 'Legacy strategy',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(strategy).toMatchObject({
      platforms: [],
      runHistory: [],
      skillSlugs: [],
      topics: [],
      workflowInputOverrides: [],
    });
  });

  it('queues the next run and clears failure state when activating', async () => {
    findOneByIdSpy = vi
      .spyOn(service, 'findOneById')
      .mockResolvedValue(makeStrategy(false));

    await service.setActive('strategy-1', 'org-1', true);

    expect(findOneByIdSpy).toHaveBeenCalledWith('strategy-1', 'org-1');
    expect(patchSpy).toHaveBeenCalledWith('strategy-1', {
      consecutiveFailures: 0,
      isActive: true,
      nextRunAt: expect.any(Date),
      requiresManualReactivation: false,
    });
  });

  it('clears the schedule when deactivating', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(makeStrategy(true));

    await service.setActive('strategy-1', 'org-1', false);

    expect(patchSpy).toHaveBeenCalledWith('strategy-1', {
      isActive: false,
      nextRunAt: null,
    });
  });

  it('does not reset derived fields when the active state is unchanged', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(makeStrategy(true));

    await service.setActive('strategy-1', 'org-1', true);

    expect(patchSpy).toHaveBeenCalledWith('strategy-1', { isActive: true });
  });

  it('returns null and does not patch when the strategy is missing', async () => {
    vi.spyOn(service, 'findOneById').mockResolvedValue(null);

    const result = await service.setActive('missing', 'org-1', true);

    expect(result).toBeNull();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('creates through the supplied transaction with canonical workflow defaults', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: ['content-writing', 'image-generation'] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        config: expect.objectContaining({
          skillSlugs: ['content-writing', 'image-generation'],
        }),
        isActive: false,
        organizationId: 'org-1',
        preferredWorkflowTemplateId: 'social-media-video-series',
        userId: 'user-1',
      }),
    });
    expect(create.mock.calls[0]?.[0].data.config).not.toHaveProperty(
      'nextRunAt',
    );
  });

  it('preserves an explicit empty skill list to inherit brand defaults', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: [] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        skillSlugs: [],
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create.mock.calls[0]?.[0].data.config).toMatchObject({
      skillSlugs: [],
    });
  });

  it('preserves an explicit nonempty skill override', async () => {
    const create = vi.fn().mockResolvedValue({
      config: { skillSlugs: ['brand-voice'] },
      id: 'strategy-1',
      policies: {},
    });

    await service.createWithClient(
      {
        agentType: AgentType.VIDEO_CREATOR,
        brandId: 'brand-1',
        isActive: false,
        label: 'Short Creator',
        organizationId: 'org-1',
        skillSlugs: ['brand-voice'],
        userId: 'user-1',
      },
      { agentStrategy: { create } } as never,
    );

    expect(create.mock.calls[0]?.[0].data.config).toMatchObject({
      skillSlugs: ['brand-voice'],
    });
  });
});
