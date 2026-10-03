import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { parseExtensionPublicationCaptureInput } from '@api/collections/posts/services/post-publication-capture.util';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type {
  AgentToolResult,
  ScheduleCanonicalPostInput,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';

/**
 * Confirms, on the server, that the requested brand belongs to the
 * authenticated organization. The request's own `context.brandId` is only a
 * consistency check, never the authority.
 */
export type ExternalPublicationBrandAuthorizer = (
  brandId: string,
  ctx: ToolExecutionContext,
) => Promise<void>;

export async function recordExternalPublicationAction(
  postsService: Pick<PostsService, 'recordExternalPublication'>,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  authorizeBrand: ExternalPublicationBrandAuthorizer,
): Promise<AgentToolResult> {
  const input = parseExtensionPublicationCaptureInput(params);
  if (!ctx.brandId || ctx.brandId !== input.brandId) {
    throw new ForbiddenException(
      'Reported publication must match the authenticated brand context',
    );
  }
  await authorizeBrand(input.brandId, ctx);
  const result = await postsService.recordExternalPublication(input, {
    brandId: input.brandId,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  return { success: true, creditsUsed: 0, data: { ...result } };
}

export async function scheduleCanonicalPostAction(
  postGroupsService: Pick<PostGroupsService, 'scheduleTarget'>,
  input: ScheduleCanonicalPostInput,
): Promise<AgentToolResult> {
  const release = await postGroupsService.scheduleTarget(
    input.ctx.organizationId,
    input.ctx.userId,
    input.groupId,
    input.postId,
    input.scheduledAt,
    {
      agentContextSource: input.ctx.validatedScope?.source,
      agentContextVersion: input.ctx.validatedScope?.contextVersion,
      workflowExecutionId: input.ctx.runId,
      agentStrategyId: input.ctx.strategyId,
      agentThreadId: input.ctx.validatedScope?.threadId,
    },
  );
  const target = release.targets?.find(
    (candidate) => candidate.id === input.postId,
  );
  if (!target || target.executionState !== TargetExecutionState.SCHEDULED) {
    throw new ConflictException(
      'Canonical scheduler did not return the scheduled release target.',
    );
  }

  return {
    creditsUsed: 1,
    data: {
      id: input.postId,
      releaseId: release.id,
      scheduledAt: target.scheduledAt ?? input.scheduledAt,
      status: target.executionState,
    },
    nextActions: [
      {
        ctas: [{ href: '/content/posts', label: 'Open posts' }],
        description:
          'The canonical release target is approval-backed and will enter the normal publish queue when due.',
        id: `scheduled-post-${input.postId}`,
        scheduledAt: target.scheduledAt ?? input.scheduledAt,
        title: 'Post scheduled',
        type: 'schedule_post_card',
      },
    ],
    success: true,
  };
}

const linkPublicationSchema = z
  .object({
    brandId: z.string().refine(isEntityId),
    postId: z.string().refine(isEntityId),
    credentialId: z.string().refine(isEntityId),
  })
  .strict();

export async function linkExternalPublicationCredentialAction(
  postsService: Pick<PostsService, 'linkExternalPublicationCredential'>,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  authorizeBrand: ExternalPublicationBrandAuthorizer,
): Promise<AgentToolResult> {
  const parsed = linkPublicationSchema.safeParse(params);
  if (!parsed.success)
    throw new BadRequestException('Invalid publication account linking input');
  if (!ctx.brandId || ctx.brandId !== parsed.data.brandId)
    throw new ForbiddenException(
      'Publication linking must match the authenticated brand context',
    );
  await authorizeBrand(parsed.data.brandId, ctx);
  const result = await postsService.linkExternalPublicationCredential(
    parsed.data,
    {
      brandId: parsed.data.brandId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
  );
  return { success: true, creditsUsed: 0, data: { ...result } };
}
