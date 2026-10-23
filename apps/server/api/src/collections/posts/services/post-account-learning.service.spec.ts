import type { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import type { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountLearningService } from '@api/collections/posts/services/post-account-learning.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentLearningArm, ContentLearningMode } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { learningContribution } from '@genfeedai/harness';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ hasEnrollment: vi.fn() }));
const exclusionsReader = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock(
  '@api/collections/content-learning/services/learning-pilot-gate.helper',
  () => ({ hasCurrentLearningPilotEnrollmentV1: gate.hasEnrollment }),
);
vi.mock(
  '@api/collections/posts/services/post-account-learning-exclusions.util',
  () => ({ readLearningArmExclusionsV1: exclusionsReader.read }),
);

const baselineVector = {
  [ContentLearningArm.BASELINE]: 1,
  [ContentLearningArm.QUESTION_EXAMPLE]: 0,
  [ContentLearningArm.PROOF_STEPS]: 0,
};
function resolution(index: number, reason = 'insufficient_baseline') {
  return {
    receipt: {
      decisionId: `decision-${index}`,
      credentialId: 'credential',
      mode: ContentLearningMode.SHADOW,
      accountRevision: 1,
      epoch: 1,
      armId: ContentLearningArm.BASELINE,
      probabilities: baselineVector,
      selectedProbability: 1,
      assignment: 'control' as const,
      assignmentProbability: 1,
      executionProbability: 1,
      configVersion: 'rl-reward-v1-experimental',
      synthetic: false,
      reason,
    },
    contribution: {},
  };
}
const dto = {
  count: 2,
  credentialId: 'credential',
  format: 'post',
  topic: '  Raw topic\r\n',
} as GenerateAccountPostDto;
const posts = [
  { id: 'post-0', groupId: 'group' },
  { id: 'post-1', groupId: 'group' },
] as unknown as PostDocument[];
const identity = { brandId: 'brand', organizationId: 'org' };

describe('PostAccountLearningService', () => {
  const decisions = {
    resolveBatchForGeneration: vi.fn(),
    bindArtifact: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  const prisma = {};
  let service: PostAccountLearningService;
  beforeEach(() => {
    vi.clearAllMocks();
    gate.hasEnrollment.mockResolvedValue(false);
    exclusionsReader.read.mockResolvedValue([]);
    decisions.resolveBatchForGeneration.mockResolvedValue([
      resolution(0),
      resolution(1),
    ]);
    decisions.bindArtifact.mockResolvedValue('hash');
    service = new PostAccountLearningService(
      decisions as unknown as LearningDecisionService,
      logger as unknown as LoggerService,
      prisma as unknown as PrismaService,
    );
  });
  it('resolves one candidate per saved draft with the exact request identity', async () => {
    const session = await service.resolve(dto, posts, identity);
    expect(decisions.resolveBatchForGeneration).toHaveBeenCalledWith({
      organizationId: 'org',
      brandId: 'brand',
      format: 'text',
      harnessEnabled: true,
      compatible: true,
      originalPrompt: '  Raw topic\r\n',
      context: {
        credentialId: 'credential',
        objective: 'awareness',
        requestKey: 'group',
      },
      candidates: [
        { candidateIndex: 0, generationId: 'post-0' },
        { candidateIndex: 1, generationId: 'post-1' },
      ],
    });
    expect(session.decisionIds).toEqual(['decision-0', 'decision-1']);
    for (const receipt of session.receipts) {
      expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
        true,
      );
      expect(receipt.application).toMatchObject({
        status: 'baseline',
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
      });
    }
  });
  it('reports threads as an unsupported cell without calling the resolver', async () => {
    const session = await service.resolve(
      { ...dto, format: 'thread' } as GenerateAccountPostDto,
      posts,
      identity,
    );
    expect(decisions.resolveBatchForGeneration).not.toHaveBeenCalled();
    expect(session.receipts.map((r) => r.reason)).toEqual([
      'unsupported_cell',
      'unsupported_cell',
    ]);
    expect(session.receipts[0].application?.status).toBe('unavailable');
  });
  it('reports a missing request identity without calling the resolver', async () => {
    const session = await service.resolve(
      dto,
      [{ id: 'post-0' }] as unknown as PostDocument[],
      identity,
    );
    expect(decisions.resolveBatchForGeneration).not.toHaveBeenCalled();
    expect(session.receipts[0].reason).toBe('invalid_request_identity');
  });
  it('degrades to unavailable receipts when the resolver throws', async () => {
    decisions.resolveBatchForGeneration.mockRejectedValue(new Error('down'));
    const session = await service.resolve(dto, posts, identity);
    expect(session.receipts.map((r) => r.application?.status)).toEqual([
      'unavailable',
      'unavailable',
    ]);
    expect(session.receipts[0].reason).toBe('learning_unavailable');
    expect(session.decisionIds).toEqual([undefined, undefined]);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Raw topic');
  });
  it('revalidates replay-only and keeps the original decision ids', async () => {
    const session = await service.resolve(dto, posts, identity);
    decisions.resolveBatchForGeneration.mockResolvedValue([
      resolution(0, 'paused'),
      resolution(1, 'paused'),
    ]);
    await service.revalidate(session);
    expect(decisions.resolveBatchForGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ replayOnly: true }),
    );
    expect(session.receipts.map((r) => r.application?.status)).toEqual([
      'suppressed',
      'suppressed',
    ]);
    expect(session.decisionIds).toEqual(['decision-0', 'decision-1']);
  });
  it('binds the saved artifact for the matching decision and swallows failures', async () => {
    const session = await service.resolve(dto, posts, identity);
    await service.bindArtifact(session, 1, 'post-1', 'Generated');
    expect(decisions.bindArtifact).toHaveBeenCalledWith(
      'org',
      'decision-1',
      'post-1',
      'Generated',
    );
    decisions.bindArtifact.mockRejectedValue(new Error('conflict'));
    await expect(
      service.bindArtifact(session, 0, 'post-0', 'Generated'),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
  it('skips artifact binding when no decision was resolved', async () => {
    const session = await service.resolve(
      { ...dto, format: 'thread' } as GenerateAccountPostDto,
      posts,
      identity,
    );
    await service.bindArtifact(session, 0, 'post-0', 'Generated');
    expect(decisions.bindArtifact).not.toHaveBeenCalled();
  });
  describe('pilot tactic', () => {
    const single = [posts[0]];
    const singleDto = { ...dto, count: 1 } as GenerateAccountPostDto;
    const exclusions = [
      { armId: ContentLearningArm.PROOF_STEPS, reasonCode: 'learning.test' },
    ];
    function appliedResolution() {
      const treatment = {
        [ContentLearningArm.BASELINE]: 0.2,
        [ContentLearningArm.QUESTION_EXAMPLE]: 0.7,
        [ContentLearningArm.PROOF_STEPS]: 0.1,
      };
      const base = resolution(0);
      return {
        receipt: {
          ...base.receipt,
          armId: ContentLearningArm.QUESTION_EXAMPLE,
          mode: ContentLearningMode.LIVE,
          scopeRevision: 1,
          probabilities: treatment,
          treatmentProbabilities: treatment,
          controlProbabilities: baselineVector,
          executionProbabilities: {
            [ContentLearningArm.BASELINE]: 0.92,
            [ContentLearningArm.QUESTION_EXAMPLE]: 0.07,
            [ContentLearningArm.PROOF_STEPS]: 0.01,
          },
          selectedProbability: 0.7,
          assignment: 'pilot' as const,
          assignmentProbability: 0.1,
          executionProbability: 0.07,
          cellDescriptor: {
            platform: 'twitter',
            format: 'text' as const,
            objective: 'awareness' as const,
            exposureSource: 'impressions' as const,
            metricWeights: [['likes' as const, 1]] as Array<['likes', number]>,
            retention: false,
            windowId: '48h-v1' as const,
            configVersion: 'rl-reward-v1-experimental' as const,
            featureSchema: 'numeric-nine-v1' as const,
            armCatalogVersion: 'learning-arms-v1' as const,
          },
          descriptorHash: 'a'.repeat(64),
          baselineId: 'baseline',
          opportunityId: 'opportunity',
          experimentId: 'experiment',
          policyVersionId: 'policy',
          reason: undefined,
        },
        contribution: learningContribution(ContentLearningArm.QUESTION_EXAMPLE),
        exclusions: [],
      };
    }
    it('leaves compatibility unknown outside a current enrollment', async () => {
      await service.resolve(singleDto, single, identity);
      expect(gate.hasEnrollment).toHaveBeenCalledTimes(1);
      expect(exclusionsReader.read).not.toHaveBeenCalled();
      expect(
        decisions.resolveBatchForGeneration.mock.calls[0][0].armExclusions,
      ).toBeUndefined();
    });
    it('never reads compatibility for a multi-candidate batch', async () => {
      gate.hasEnrollment.mockResolvedValue(true);
      await service.resolve(dto, posts, identity);
      expect(gate.hasEnrollment).not.toHaveBeenCalled();
      expect(exclusionsReader.read).not.toHaveBeenCalled();
    });
    it('reads brand compatibility for an enrolled single candidate', async () => {
      gate.hasEnrollment.mockResolvedValue(true);
      exclusionsReader.read.mockResolvedValue(exclusions);
      await service.resolve(singleDto, single, identity);
      expect(gate.hasEnrollment).toHaveBeenCalledWith(
        prisma,
        { organizationId: 'org', brandId: 'brand', credentialId: 'credential' },
        expect.any(Date),
      );
      expect(
        decisions.resolveBatchForGeneration.mock.calls[0][0].armExclusions,
      ).toEqual(exclusions);
    });
    it('keeps compatibility unknown when the read fails', async () => {
      gate.hasEnrollment.mockRejectedValue(new Error('down'));
      const session = await service.resolve(singleDto, single, identity);
      expect(
        decisions.resolveBatchForGeneration.mock.calls[0][0].armExclusions,
      ).toBeUndefined();
      expect(session.receipts).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
    it('carries a contribution only for a receipt that applied', async () => {
      decisions.resolveBatchForGeneration.mockResolvedValue([
        appliedResolution(),
      ]);
      const session = await service.resolve(singleDto, single, identity);
      expect(session.receipts[0].application?.status).toBe('applied');
      expect(session.contributions).toEqual([
        learningContribution(ContentLearningArm.QUESTION_EXAMPLE),
      ]);
    });
    it('drops a contribution whose receipt is not applied', async () => {
      const unapplied = appliedResolution();
      unapplied.exclusions = exclusions.map((exclusion) => ({
        ...exclusion,
        armId: ContentLearningArm.QUESTION_EXAMPLE,
      })) as never;
      decisions.resolveBatchForGeneration.mockResolvedValue([unapplied]);
      const session = await service.resolve(singleDto, single, identity);
      expect(session.receipts[0].application?.status).toBe('suppressed');
      expect(session.contributions).toEqual([{}]);
    });
    it('drops the contribution when revalidation no longer applies it', async () => {
      gate.hasEnrollment.mockResolvedValue(true);
      decisions.resolveBatchForGeneration.mockResolvedValue([
        appliedResolution(),
      ]);
      const session = await service.resolve(singleDto, single, identity);
      expect(session.contributions[0]).not.toEqual({});
      decisions.resolveBatchForGeneration.mockResolvedValue([
        resolution(0, 'paused'),
      ]);
      await service.revalidate(session);
      expect(session.receipts[0].application?.status).toBe('suppressed');
      expect(session.contributions).toEqual([{}]);
      expect(session.decisionIds).toEqual(['decision-0']);
    });
    it('rereads compatibility on revalidation only when it was known', async () => {
      gate.hasEnrollment.mockResolvedValue(true);
      exclusionsReader.read.mockResolvedValue([]);
      const session = await service.resolve(singleDto, single, identity);
      exclusionsReader.read.mockResolvedValue(exclusions);
      await service.revalidate(session);
      expect(session.input?.armExclusions).toEqual(exclusions);
      const unknown = await service.resolve(dto, posts, identity);
      exclusionsReader.read.mockClear();
      await service.revalidate(unknown);
      expect(exclusionsReader.read).not.toHaveBeenCalled();
      expect(unknown.input?.armExclusions).toBeUndefined();
    });
  });
});
