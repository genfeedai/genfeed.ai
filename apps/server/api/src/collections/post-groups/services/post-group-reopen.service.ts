import { syncReleaseAttachmentPosts } from '@api/collections/post-groups/services/post-group-attachment-sync';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { GROUP_ACTION_STATES } from '@api/collections/post-groups/services/post-group-target.operations';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';

/**
 * Brings a cancelled release back on the same record. A post cancelled by
 * mistake is one row again, not a second release.
 */
@Injectable()
export class PostGroupReopenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
    private readonly persistenceService: PostGroupPersistenceService,
    private readonly contractService: PostGroupContractService,
  ) {}

  /**
   * Cancelled targets go back to draft. With a future `scheduledDate` in the
   * body they are scheduled again at that time.
   */
  async reopen(
    organizationId: string,
    userId: string,
    groupId: string,
    body?: unknown,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<IReleaseGroup> {
    const scheduledDate =
      body && typeof body === 'object' && 'scheduledDate' in body
        ? this.contractService.readScheduledDate(body)
        : undefined;
    if (scheduledDate !== undefined) {
      assertApiKeyPublishingScope(apiKeyContext ?? {}, 'schedule');
      this.contractService.parseFutureScheduleDate(scheduledDate);
    } else {
      assertApiKeyPublishingScope(apiKeyContext ?? {}, 'draft');
    }

    const current = await this.postGroupsService.getOne(
      organizationId,
      groupId,
    );
    const cancelledIds = (current.targets ?? [])
      .filter(
        (target) => target.executionState === TargetExecutionState.CANCELLED,
      )
      .map((target) => target.id);
    if (cancelledIds.length === 0) {
      throw new ConflictException(
        'This release has no cancelled post to reopen.',
      );
    }

    let release = await this.postGroupsService.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.DRAFT,
      [TargetExecutionState.CANCELLED],
    );
    await this.prisma.$transaction(async (tx) => {
      const group = await this.persistenceService.getGroupOrThrow(
        tx,
        organizationId,
        groupId,
      );
      const targets = await this.persistenceService.getTargets(
        tx,
        organizationId,
        group.id,
      );
      // Comment posts were left behind by the cancel; carry the target's draft
      // state onto them so they follow the post when it is scheduled again.
      await syncReleaseAttachmentPosts(tx, {
        editableStates: GROUP_ACTION_STATES,
        group,
        organizationId,
        targets,
        userId,
      });
    });

    if (scheduledDate !== undefined) {
      for (const targetId of cancelledIds) {
        release = await this.postGroupsService.scheduleTarget(
          organizationId,
          userId,
          groupId,
          targetId,
          scheduledDate,
          { source: 'post-desk' },
        );
      }
    }
    return release;
  }
}
