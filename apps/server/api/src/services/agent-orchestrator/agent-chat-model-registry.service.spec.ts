import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

const row = (overrides: Record<string, unknown>) => ({
  cost: 4,
  isActive: true,
  isDefault: false,
  isDiscovered: false,
  isFree: false,
  key: 'provider/model',
  label: 'Model',
  lifecycle: ModelLifecycle.AVAILABLE,
  provider: ModelProvider.OPENROUTER,
  reviewStatus: null,
  succeededBy: null,
  ...overrides,
});

describe('AgentChatModelRegistryService', () => {
  it('keeps Legacy explicit, hides Retired, and follows Retired successors', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          row({
            key: 'legacy',
            lifecycle: ModelLifecycle.LEGACY,
          }),
          row({
            isActive: false,
            key: 'retired',
            lifecycle: ModelLifecycle.RETIRED,
            succeededBy: 'recommended',
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.listSelectable()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'recommended' }),
        expect.objectContaining({ key: 'legacy' }),
      ]),
    );
    expect(
      (await service.listSelectable()).map((model) => model.key),
    ).not.toContain('retired');
    await expect(service.resolveModelKey('retired')).resolves.toBe(
      'recommended',
    );
    await expect(service.resolveModelKey('legacy')).resolves.toBe('legacy');
  });

  it('limits Auto to reviewed, priced Recommended models', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          row({ key: 'available', lifecycle: ModelLifecycle.AVAILABLE }),
          row({
            cost: 0,
            key: 'unpriced',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
          row({
            isDiscovered: true,
            key: 'pending',
            lifecycle: ModelLifecycle.RECOMMENDED,
            reviewStatus: 'pending',
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.getAutoAllowedModelKeys()).resolves.toEqual([
      'recommended',
    ]);
  });
});
