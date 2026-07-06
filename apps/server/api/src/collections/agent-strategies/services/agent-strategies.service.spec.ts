vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategiesService.setActive', () => {
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
});
