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
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { type PostDocument } from '@api/collections/posts/post.schema';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type GenerationIdentity = Pick<AuthenticatedUser, 'brandId' | 'organizationId'>;
export interface PostAccountLearningSession {
  organizationId: string;
  input: LearningBatchGenerationInput | null;
  receipts: LearningGenerationReceipt[];
  decisionIds: Array<string | undefined>;
}

/**
 * Logs one immutable learning decision per account-generated draft and keeps
 * its dispatch-time receipt. Learning never changes the prompt in this
 * revision and never blocks generation: every failure degrades to an
 * `unavailable` receipt.
 */
@Injectable()
export class PostAccountLearningService {
  private readonly logContext = 'PostAccountLearningService';
  constructor(
    private readonly learningDecisionService: LearningDecisionService,
    private readonly logger: LoggerService,
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
        candidateIndex,
        generationId: String(post.id),
      })),
    };
    const session: PostAccountLearningSession = {
      organizationId: identity.organizationId,
      input,
      receipts: [],
      decisionIds: [],
    };
    await this.record(session, false);
    return session;
  }
  /** Revalidates existing decisions before a repair dispatch; never resamples. */
  async revalidate(session: PostAccountLearningSession): Promise<void> {
    if (session.input) await this.record(session, true);
  }
  async bindArtifact(
    session: PostAccountLearningSession,
    index: number,
    postId: string,
  ): Promise<void> {
    const decisionId = session.decisionIds[index];
    if (!decisionId) return;
    try {
      await this.learningDecisionService.bindArtifact(
        session.organizationId,
        decisionId,
        postId,
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
    if (!replayOnly)
      session.decisionIds = input.candidates.map(
        (_, index) => resolutions?.[index]?.receipt.decisionId,
      );
  }
}
