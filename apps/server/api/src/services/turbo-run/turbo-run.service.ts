import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type {
  TurboRunProcessOptions,
  ReviewInboxSummary,
} from '@api/services/turbo-run/turbo-run.types';
import { TurboRunCreationService } from '@api/services/turbo-run/turbo-run-creation.service';
import { TurboRunProcessingService } from '@api/services/turbo-run/turbo-run-processing.service';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { CreateTurboRunDto } from '@api/services/turbo-run/dto/create-turbo-run.dto';
import { CreateManualReviewTurboRunDto } from '@api/services/turbo-run/dto/create-manual-review-turbo-run.dto';
import { UpdateTurboRunDto } from '@api/services/turbo-run/dto/update-turbo-run.dto';
import { TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export type {
  ReviewInboxItemSummary,
  ReviewInboxSummary,
} from '@api/services/turbo-run/turbo-run.types';

@Injectable()
export class TurboRunService {
  constructor(
    private readonly creationService: TurboRunCreationService,
    private readonly processingService: TurboRunProcessingService,
    private readonly reviewService: TurboRunReviewService,
  ) {}

  approveAutonomousItems(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    userId: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.approveItems(
      turboRunId,
      itemIds,
      orgId,
      userId,
      true,
    );
  }

  @HandleErrors('create run', 'turbo-run')
  createTurboRun(
    dto: CreateTurboRunDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
    strategyId?: string,
  ): Promise<ITurboRunSummary> {
    return this.creationService.createTurboRun(
      dto,
      userId,
      orgId,
      idempotencyKey,
      strategyId,
    );
  }

  @HandleErrors('create manual review run', 'turbo-run')
  createManualReviewTurboRun(
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<ITurboRunSummary> {
    return this.creationService.createManualReviewTurboRun(
      dto,
      userId,
      orgId,
      idempotencyKey,
    );
  }

  @HandleErrors('append manual review items', 'turbo-run')
  appendManualReviewItems(
    turboRunId: string,
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    return this.creationService.appendManualReviewItems(
      turboRunId,
      dto,
      userId,
      orgId,
    );
  }

  @HandleErrors('get review inbox summary', 'turbo-run')
  getReviewInboxSummary(
    orgId: string,
    brandId?: string,
    limit = 5,
  ): Promise<ReviewInboxSummary> {
    return this.reviewService.getReviewInboxSummary(orgId, brandId, limit);
  }

  @HandleErrors('process run', 'turbo-run')
  processTurboRun(
    turboRunId: string,
    orgId: string,
    options?: TurboRunProcessOptions,
  ): Promise<ITurboRunSummary> {
    return this.processingService.processTurboRun(turboRunId, orgId, options);
  }

  @HandleErrors('get run', 'turbo-run')
  getTurboRun(turboRunId: string, orgId: string): Promise<ITurboRunSummary> {
    return this.reviewService.getTurboRun(turboRunId, orgId);
  }

  @HandleErrors('get runs', 'turbo-run')
  getTurboRuns(
    orgId: string,
    query?: { status?: TurboRunStatus; limit?: number; offset?: number },
  ): Promise<{ items: ITurboRunSummary[]; total: number }> {
    return this.reviewService.getTurboRuns(orgId, query);
  }

  @HandleErrors('approve items', 'turbo-run')
  approveItems(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    createdByUserId: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.approveItems(
      turboRunId,
      itemIds,
      orgId,
      createdByUserId,
    );
  }

  @HandleErrors('reject items', 'turbo-run')
  rejectItems(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.rejectItems(
      turboRunId,
      itemIds,
      orgId,
      feedback,
      actorUserId,
    );
  }

  linkDestinationPosts(
    turboRunId: string,
    itemId: string,
    postIds: string[],
    orgId: string,
  ): Promise<void> {
    return this.reviewService.linkDestinationPosts(
      turboRunId,
      itemId,
      postIds,
      orgId,
    );
  }

  @HandleErrors('assign item', 'turbo-run')
  assignItem(
    turboRunId: string,
    itemId: string,
    assigneeId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.assignItem(turboRunId, itemId, assigneeId, orgId);
  }

  @HandleErrors('unassign item', 'turbo-run')
  unassignItem(
    turboRunId: string,
    itemId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.unassignItem(turboRunId, itemId, orgId);
  }

  @HandleErrors('request changes', 'turbo-run')
  requestChanges(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.requestChanges(
      turboRunId,
      itemIds,
      orgId,
      feedback,
      actorUserId,
    );
  }

  @HandleErrors('cancel run', 'turbo-run')
  cancelTurboRun(turboRunId: string, orgId: string): Promise<ITurboRunSummary> {
    return this.reviewService.cancelTurboRun(turboRunId, orgId);
  }

  @HandleErrors('update run', 'turbo-run')
  updateTurboRun(
    turboRunId: string,
    dto: UpdateTurboRunDto,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    return this.reviewService.updateTurboRun(turboRunId, dto, orgId);
  }
}
