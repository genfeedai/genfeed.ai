import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { ForbiddenException } from '@nestjs/common';

interface ClipWorkflowActorInput {
  orgId: unknown;
  userId: unknown;
}

/** The trusted execution context owns tenant and actor identity. */
export function assertClipWorkflowActor(
  request: SystemWorkflowActionRequest,
  actor?: ClipWorkflowActorInput,
): void {
  const organizationId = request.context?.organizationId;
  const userId = request.context?.userId;
  if (
    typeof organizationId !== 'string' ||
    !organizationId.trim() ||
    typeof userId !== 'string' ||
    !userId.trim() ||
    (actor !== undefined &&
      (!actor || actor.orgId !== organizationId || actor.userId !== userId)) ||
    (Object.hasOwn(request.input, 'orgId') &&
      request.input.orgId !== organizationId) ||
    (Object.hasOwn(request.input, 'organizationId') &&
      request.input.organizationId !== organizationId) ||
    (Object.hasOwn(request.input, 'userId') && request.input.userId !== userId)
  ) {
    throw new ForbiddenException(
      'Clip workflow input does not match its execution actor.',
    );
  }
}
