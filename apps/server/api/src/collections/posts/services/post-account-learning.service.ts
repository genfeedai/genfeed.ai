import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type LearningBatchGenerationInput,
  LearningDecisionService,
  type LearningResolution,
} from '@api/collections/content-learning/services/learning-decision.service';
import {
  learningGenerationApplicationReceiptV1,
  unavailableLearningReceiptV1,
} from '@api/collections/content-learning/services/learning-generation-application.util';
import { hasCurrentLearningPilotEnrollmentV1 } from '@api/collections/content-learning/services/learning-pilot-gate.helper';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { type PostDocument } from '@api/collections/posts/post.schema';
import { readLearningArmExclusionsV1 } from '@api/collections/posts/services/post-account-learning-exclusions.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  LearningArmExclusionV1,
  LearningGenerationReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { ContentHarnessContribution } from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type GenerationIdentity = Pick<AuthenticatedUser, 'brandId' | 'organizationId'>;
export interface PostAccountLearningSession {
  organizationId: string;
  input: LearningBatchGenerationInput | null;
  receipts: LearningGenerationReceipt[];
  /** What each applied receipt contributes; empty unless it truly applied. */
  contributions: ContentHarnessContribution[];
  decisionIds: Array<string | undefined>;
}

/**
 * Logs one immutable learning decision per account-generated draft and keeps
 * its dispatch-time receipt. A tactic is contributed only when the receipt
 * says it was applied, and learning never blocks generation: every failure
 * degrades to an `unavailable` receipt with no contribution.
 */
@Injectable()
export class PostAccountLearningService {
  private readonly logContext = 'PostAccountLearningService';
  constructor(
    private readonly learningDecisionService: LearningDecisionService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}
  async resolve(
    dto: GenerateAccountPostDto,
    createdPosts: PostDocument[],
    identity: GenerationIdentity,
  ): Promise<PostAccountLearningSession> {
    const unavailable = (reason: string): PostAccountLearningSession => ({
      organizationId: identity.organizationId,
      input: null,
      receipts: createdPosts.map(() =>
        unavailableLearningReceiptV1(reason, new Date()),
      ),
      contributions: createdPosts.map(() => ({})),
      decisionIds: createdPosts.map(() => undefined),
    });
    if (dto.format !== 'post') return unavailable('unsupported_cell');
    const requestKey = createdPosts[0]?.groupId
      ? String(createdPosts[0].groupId)
      : '';
    if (!requestKey || requestKey.length > 256)
      return unavailable('invalid_request_identity');
    const input: LearningBatchGenerationInput = {
      organizationId: identity.organizationId,
      brandId: identity.brandId,
      format: 'text',
      harnessEnabled: true,
      compatible: true,
      originalPrompt: dto.topic,
      context: {
        credentialId: dto.credentialId,
        objective: 'awareness',
        requestKey,
      },
      candidates: createdPosts.map((post, candidateIndex) => ({
        candidateIndex: post.order ?? candidateIndex,
        generationId: String(post.id),
      })),
    };
    const session: PostAccountLearningSession = {
      organizationId: identity.organizationId,
      input,
      receipts: [],
      contributions: [],
      decisionIds: [],
    };
    input.armExclusions = await this.readExclusions(input);
    await this.record(session, false);
    return session;
  }
  /**
   * Revalidates existing decisions before a dispatch; never resamples. A
   * pause, reset, rollback or newly incompatible brand drops the contribution.
   */
  async revalidate(session: PostAccountLearningSession): Promise<void> {
    if (!session.input) return;
    if (session.input.armExclusions !== undefined)
      session.input.armExclusions = await this.readExclusions(session.input);
    await this.record(session, true);
  }
  /**
   * Brand compatibility is read only for a single candidate inside a current
   * pilot enrollment. Anywhere else it stays undefined, which excludes every
   * learned arm, so ordinary generation never pays for the read.
   */
  private async readExclusions(
    input: LearningBatchGenerationInput,
  ): Promise<LearningArmExclusionV1[] | undefined> {
    const { organizationId, brandId, context } = input;
    if (input.candidates.length !== 1 || !context.credentialId)
      return undefined;
    try {
      const now = new Date();
      return (await hasCurrentLearningPilotEnrollmentV1(
        this.prisma,
        { organizationId, brandId, credentialId: context.credentialId },
        now,
      ))
        ? await readLearningArmExclusionsV1(
            this.prisma,
            { organizationId, brandId },
            now,
          )
        : undefined;
    } catch (error) {
      this.logger.warn(`${this.logContext} brand compatibility unavailable`, {
        error: error instanceof Error ? error.name : 'unknown',
        organizationId,
      });
      return undefined;
    }
  }
  async bindArtifact(
    session: PostAccountLearningSession,
    index: number,
    postId: string,
    generatedText: string,
  ): Promise<void> {
    const decisionId = session.decisionIds[index];
    if (!decisionId) return;
    try {
      await this.learningDecisionService.bindArtifact(
        session.organizationId,
        decisionId,
        postId,
        generatedText,
      );
    } catch (error) {
      this.logger.warn(`${this.logContext} artifact binding skipped`, {
        decisionId,
        error: error instanceof Error ? error.name : 'unknown',
        postId,
      });
    }
  }
  private async record(
    session: PostAccountLearningSession,
    replayOnly: boolean,
  ): Promise<void> {
    const input = session.input as LearningBatchGenerationInput;
    let resolutions: LearningResolution[] | null = null;
    try {
      resolutions =
        await this.learningDecisionService.resolveBatchForGeneration(
          replayOnly ? { ...input, replayOnly } : input,
        );
    } catch (error) {
      this.logger.warn(`${this.logContext} learning resolution unavailable`, {
        error: error instanceof Error ? error.name : 'unknown',
        replayOnly,
        requestKey: input.context.requestKey,
      });
    }
    const revalidatedAt = new Date();
    session.receipts = input.candidates.map((_, index) => {
      const resolution = resolutions?.[index];
      return resolution
        ? learningGenerationApplicationReceiptV1(resolution, revalidatedAt)
        : unavailableLearningReceiptV1('learning_unavailable', revalidatedAt);
    });
    session.contributions = input.candidates.map((_, index) =>
      session.receipts[index].application?.status === 'applied'
        ? (resolutions?.[index]?.contribution ?? {})
        : {},
    );
    if (!replayOnly)
      session.decisionIds = input.candidates.map(
        (_, index) => resolutions?.[index]?.receipt.decisionId,
      );
  }
}
