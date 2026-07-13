export const AGENT_ARTIFACT_RECORD_KINDS = [
  'article',
  'asset',
  'content-draft',
  'ingredient',
  'newsletter',
  'post',
] as const;

export type AgentArtifactRecordKind =
  (typeof AGENT_ARTIFACT_RECORD_KINDS)[number];

export type AgentArtifactSerializer = AgentArtifactRecordKind;

export const AGENT_ARTIFACT_SERIALIZER_BY_KIND = {
  article: 'article',
  asset: 'asset',
  'content-draft': 'content-draft',
  ingredient: 'ingredient',
  newsletter: 'newsletter',
  post: 'post',
} as const satisfies Readonly<
  Record<AgentArtifactRecordKind, AgentArtifactSerializer>
>;

type AgentArtifactReferenceForKind<Kind extends AgentArtifactRecordKind> = {
  brandId?: string;
  kind: Kind;
  organizationId: string;
  recordId: string;
  serializer: (typeof AGENT_ARTIFACT_SERIALIZER_BY_KIND)[Kind];
};

/**
 * A scoped pointer to one existing canonical content record. The serializer is
 * part of the discriminated contract so callers cannot select an unrelated
 * response shape for a record kind.
 */
export type AgentArtifactReference = {
  [Kind in AgentArtifactRecordKind]: AgentArtifactReferenceForKind<Kind>;
}[AgentArtifactRecordKind];

/**
 * The immutable identity of the exact canonical-record state used by a
 * version-bound review or consequential action.
 */
export interface AgentArtifactVersionPin {
  brandId?: string;
  contentDigest: string;
  createdAt: string;
  createdByUserId: string;
  id: string;
  idempotencyKey: string;
  kind: AgentArtifactRecordKind;
  organizationId: string;
  provenance: Record<string, unknown>;
  recordId: string;
  recordVersion?: string;
}

/** Server-authoritative scope required before resolving a reference or pin. */
export interface AgentArtifactReferenceReadContext {
  brandId?: string;
  organizationId: string;
}

export type AgentArtifactReferenceResolutionSource =
  | 'canonical'
  | 'legacy-message';

/**
 * A canonical serializer result plus the reference and optional immutable pin
 * that produced it. Serialized data remains opaque at this shared boundary.
 */
export interface ResolvedAgentArtifactReference {
  reference: AgentArtifactReference;
  serialized: unknown;
  source: AgentArtifactReferenceResolutionSource;
  versionPin?: AgentArtifactVersionPin;
}
