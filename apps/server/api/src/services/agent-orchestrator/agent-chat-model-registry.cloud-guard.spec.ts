import {
  buildGuardedDelegate,
  type GuardedRow,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import { AGENT_CHAT_CAPABILITY } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

function modelRow(key: string, organizationId: string | null): GuardedRow {
  return {
    capabilities: [AGENT_CHAT_CAPABILITY],
    category: ModelCategory.TEXT,
    cost: 1,
    id: key,
    inputCostPerMillionTokens: 1,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isDiscovered: false,
    isFree: false,
    key,
    label: key,
    lifecycle: ModelLifecycle.AVAILABLE,
    organizationId,
    outputCostPerMillionTokens: 2,
    provider: 'openrouter',
    recommendedFor: [],
    reviewStatus: 'approved',
    succeededBy: null,
    supportsFeatures: [],
  };
}

describe('AgentChatModelRegistryService under the CLOUD tenant guard', () => {
  it('refreshes the shared cache inside a tenant request from platform rows only', async () => {
    const prisma = {
      model: buildGuardedDelegate('Model', [
        modelRow('platform/model', null),
        modelRow('tenant/private', 'org-1'),
        modelRow('other/private', 'org-2'),
      ]),
    } as unknown as PrismaService;
    const logger = { warn: vi.fn() } as unknown as LoggerService;
    const registry = new AgentChatModelRegistryService(prisma, logger);

    const selectable = await runWithTenantContext(
      { organizationId: 'org-1' },
      async () => {
        await registry.refresh();
        return registry.listSelectable();
      },
    );

    expect(selectable.map((row) => row.key)).toEqual(['platform/model']);
  });
});
