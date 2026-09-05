import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CURATED_ACTION_CATALOG,
  isPublishingApprovalRequired,
} from '@genfeedai/actions';
import { ApiKeyScope, TargetExecutionState } from '@genfeedai/contracts';

import { ForbiddenException } from '@nestjs/common';

export type PublishingCapability = 'approve' | 'draft' | 'publish' | 'schedule';

export type ApiKeyPublishingContext = Pick<
  AuthenticatedUser,
  'isApiKey' | 'scopes'
>;

export const API_KEY_POSTING_CONFIGURATION_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.POSTS_SCHEDULE,
] as const;

export const API_KEY_POST_CREATION_SCOPES = [
  ...API_KEY_POSTING_CONFIGURATION_SCOPES,
  ApiKeyScope.POSTS_PUBLISH,
] as const;

const PUBLISHING_CAPABILITY_SCOPES = {
  approve: [ApiKeyScope.POSTS_APPROVE],
  draft: [ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE],
  publish: [ApiKeyScope.POSTS_PUBLISH],
  schedule: [ApiKeyScope.POSTS_SCHEDULE],
} as const satisfies Record<PublishingCapability, readonly ApiKeyScope[]>;

const PUBLISHING_MCP_APPROVAL_TOOLS: ReadonlySet<string> = new Set(
  CURATED_ACTION_CATALOG.filter(isPublishingApprovalRequired).map(
    (entry) => entry.name,
  ),
);

export function assertApiKeyPublishingScope(
  context: ApiKeyPublishingContext,
  capability: PublishingCapability,
): void {
  if (context.isApiKey !== true) {
    return;
  }

  const acceptedScopes = PUBLISHING_CAPABILITY_SCOPES[capability];
  const grantedScopes = Array.isArray(context.scopes) ? context.scopes : [];
  if (acceptedScopes.some((scope) => grantedScopes.includes(scope))) {
    return;
  }

  throw new ForbiddenException({
    code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
    detail: `This publishing action requires ${acceptedScopes.join(' or ')}.`,
    requiredScopes: acceptedScopes,
    title: 'Insufficient API key publishing scope',
  });
}

export function assertApiKeyPostStatusPublishingScope(
  context: ApiKeyPublishingContext,
  executionState: TargetExecutionState | undefined,
): void {
  assertApiKeyPublishingScope(
    context,
    executionState === TargetExecutionState.DRAFT
      ? 'draft'
      : executionState === undefined ||
          executionState === TargetExecutionState.SCHEDULED
        ? 'schedule'
        : 'publish',
  );
}

export function assertApiKeyAgentPublishingScope(
  context: ApiKeyPublishingContext,
  toolName: string,
  parameters: Record<string, unknown>,
): void {
  if (toolName === 'schedule_post') {
    assertApiKeyPublishingScope(context, 'schedule');
    return;
  }

  if (toolName !== 'create_post') {
    return;
  }

  const isConfirmedPublish = parameters.confirmed === true;
  const isScheduled =
    typeof parameters.scheduledAt === 'string' &&
    parameters.scheduledAt.trim().length > 0;

  assertApiKeyPublishingScope(
    context,
    !isConfirmedPublish ? 'draft' : isScheduled ? 'schedule' : 'publish',
  );
}

export function isPublishingMcpApprovalTool(toolName: string): boolean {
  return PUBLISHING_MCP_APPROVAL_TOOLS.has(toolName);
}
