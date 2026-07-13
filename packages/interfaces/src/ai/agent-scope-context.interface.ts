export type AgentScopeSource =
  | 'explicit'
  | 'legacy_execution_policy'
  | 'legacy_message_history'
  | 'legacy_organization_only'
  | 'thread_created';

export interface AgentScopePayload {
  brandId?: string | null;
  expectedContextVersion?: number;
}

export interface AgentRoutingPlugin {
  id: string;
}

export type AgentRoutingPolicyReason =
  | 'default'
  | 'explicit-web-search'
  | 'fresh-live-data';

export interface AgentRoutingPolicy {
  plugins?: AgentRoutingPlugin[];
  reason: AgentRoutingPolicyReason;
}

export interface ValidatedAgentScope {
  brandId?: string;
  contextVersion: number;
  isLegacyFallback: boolean;
  isVersionExplicit: boolean;
  organizationId: string;
  provenanceId?: string;
  source: AgentScopeSource;
  threadId: string;
  userId: string;
}

export interface AgentScopeMetadata {
  brandId?: string;
  contextVersion: number;
  isLegacyFallback: boolean;
  organizationId: string;
  provenanceId?: string;
  source: AgentScopeSource;
  threadId: string;
}

export const toAgentScopeMetadata = (
  scope: ValidatedAgentScope,
): AgentScopeMetadata => ({
  brandId: scope.brandId,
  contextVersion: scope.contextVersion,
  isLegacyFallback: scope.isLegacyFallback,
  organizationId: scope.organizationId,
  provenanceId: scope.provenanceId,
  source: scope.source,
  threadId: scope.threadId,
});
