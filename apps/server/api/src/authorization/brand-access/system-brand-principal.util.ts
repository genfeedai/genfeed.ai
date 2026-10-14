import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';

export interface SystemBrandPrincipalCandidate {
  apiKeyId?: string;
  isApiKey?: boolean;
  organizationId: string;
  userId: string;
}

/**
 * True only for the non-login system principal acting inside the system
 * organization. That principal is deliberately never a Member, so brand access
 * grants it the system organization's brands (Genfeed's own) and nothing else:
 * any other organization, or an API key presenting its id, is a normal actor.
 */
export function isSystemBrandPrincipal(
  actor: SystemBrandPrincipalCandidate,
): boolean {
  return (
    actor.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    actor.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    !actor.isApiKey &&
    !actor.apiKeyId
  );
}
