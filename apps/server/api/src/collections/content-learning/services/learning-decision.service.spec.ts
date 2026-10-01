import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import type { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
describe('honest read-only preview', () => {
  it('returns empty contribution while assignment is unavailable', async () => {
    const accounts = {
      credential: vi.fn().mockResolvedValue({ id: 'credential' }),
      read: vi.fn().mockResolvedValue({ mode: 'live', revision: 0, epoch: 0 }),
    };
    const service = new LearningDecisionService(
      {} as PrismaService,
      accounts as unknown as LearningAccountService,
      {} as LearningCheckpointService,
      {} as LearningPolicyService,
    );
    const result = await service.previewForContext({
      organizationId: 'org',
      brandId: 'brand',
      format: 'text',
      context: {
        credentialId: 'credential',
        requestKey: 'request',
        candidateIndex: 0,
      },
      harnessEnabled: true,
      compatible: true,
      originalPrompt: 'test',
    });
    expect(result.contribution).toEqual({});
    expect(result.receipt.reason).toBe('experiment_assignment_unavailable');
  });
});
