import type { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import type { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountLearningService } from '@api/collections/posts/services/post-account-learning.service';
import { ContentLearningArm, ContentLearningMode } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  let service: PostAccountLearningService;
  beforeEach(() => {
    vi.clearAllMocks();
    decisions.resolveBatchForGeneration.mockResolvedValue([
      resolution(0),
      resolution(1),
    ]);
    decisions.bindArtifact.mockResolvedValue('hash');
    service = new PostAccountLearningService(
      decisions as unknown as LearningDecisionService,
      logger as unknown as LoggerService,
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
    await service.bindArtifact(session, 1, 'post-1');
    expect(decisions.bindArtifact).toHaveBeenCalledWith(
      'org',
      'decision-1',
      'post-1',
    );
    decisions.bindArtifact.mockRejectedValue(new Error('conflict'));
    await expect(
      service.bindArtifact(session, 0, 'post-0'),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
  it('skips artifact binding when no decision was resolved', async () => {
    const session = await service.resolve(
      { ...dto, format: 'thread' } as GenerateAccountPostDto,
      posts,
      identity,
    );
    await service.bindArtifact(session, 0, 'post-0');
    expect(decisions.bindArtifact).not.toHaveBeenCalled();
  });
});
