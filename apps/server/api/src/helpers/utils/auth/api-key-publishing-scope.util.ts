import type { IAuthPublicMetadata } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeyScope } from '@genfeedai/enums';
import type { CuratedActionName } from '@genfeedai/tools';
import { ForbiddenException } from '@nestjs/common';

export type PublishingCapability = 'approve' | 'draft' | 'publish' | 'schedule';

export type ApiKeyPublishingContext = Pick<
  IAuthPublicMetadata,
  'isApiKey' | 'scopes'
>;

const PUBLISHING_CAPABILITY_SCOPES = {
  approve: [ApiKeyScope.POSTS_APPROVE],
  draft: [ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE],
  publish: [ApiKeyScope.POSTS_PUBLISH],
  schedule: [ApiKeyScope.POSTS_SCHEDULE],
} as const satisfies Record<PublishingCapability, readonly ApiKeyScope[]>;

const PUBLISHING_MCP_APPROVAL_TOOL_NAMES = [
  'approve_social_draft',
  'control_scheduled_release',
  'create_post',
  'create_scheduled_release',
  'post_social_reply',
  'send_social_dm',
  'update_scheduled_release',
] as const satisfies readonly CuratedActionName[];

const PUBLISHING_MCP_APPROVAL_TOOLS: ReadonlySet<string> = new Set(
  PUBLISHING_MCP_APPROVAL_TOOL_NAMES,
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

export function isPublishingMcpApprovalTool(toolName: string): boolean {
  return PUBLISHING_MCP_APPROVAL_TOOLS.has(toolName);
}
