import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
} from '@genfeedai/interfaces';
import { AGENT_ARTIFACT_SERIALIZER_BY_KIND } from '@genfeedai/interfaces';

const MAX_COMPLETION_ARTIFACT_REFERENCES = 100;

const EXPLICIT_RESULT_ID_KEYS = {
  article: { many: 'articleIds', one: 'articleId' },
  asset: { many: 'assetIds', one: 'assetId' },
  'content-draft': { many: 'contentDraftIds', one: 'contentDraftId' },
  ingredient: { many: 'ingredientIds', one: 'ingredientId' },
  newsletter: { many: 'newsletterIds', one: 'newsletterId' },
  post: { many: 'postIds', one: 'postId' },
} as const satisfies Record<
  AgentArtifactRecordKind,
  { many: string; one: string }
>;

export interface AgentArtifactCompletionMetadata
  extends Record<string, unknown> {
  artifactReferences?: AgentArtifactReference[];
  artifactVersionPinIds?: string[];
}

interface AgentArtifactCompletionContext {
  brandId?: string;
  organizationId: string;
  runId?: string;
  scope?: { brandId?: string };
}

interface AgentArtifactRunMetadataWriter {
  mergeMetadata(
    id: string,
    organizationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
}

export function mergeAgentArtifactCompletionMetadata(
  metadata: AgentArtifactCompletionMetadata[],
): AgentArtifactCompletionMetadata {
  const uniqueReferences = new Map<string, AgentArtifactReference>();
  const pinIds = new Set<string>();

  for (const item of metadata) {
    for (const reference of item.artifactReferences ?? []) {
      if (uniqueReferences.size >= MAX_COMPLETION_ARTIFACT_REFERENCES) break;
      uniqueReferences.set(
        `${reference.kind}:${reference.recordId}`,
        reference,
      );
    }
    for (const pinId of item.artifactVersionPinIds ?? []) {
      if (pinIds.size >= MAX_COMPLETION_ARTIFACT_REFERENCES) break;
      pinIds.add(pinId);
    }
  }

  return {
    ...(uniqueReferences.size > 0
      ? { artifactReferences: [...uniqueReferences.values()] }
      : {}),
    ...(pinIds.size > 0 ? { artifactVersionPinIds: [...pinIds] } : {}),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => item !== undefined)
    : [];
}

function buildReference(
  kind: AgentArtifactRecordKind,
  recordId: string,
  organizationId: string,
  brandId?: string,
): AgentArtifactReference {
  return {
    ...(brandId ? { brandId } : {}),
    kind,
    organizationId,
    recordId,
    serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND[kind],
  } as AgentArtifactReference;
}

/**
 * Extracts only explicit, typed record-id fields returned by backend tools.
 * Presentation URLs, message text, action ids, and UI-action payloads are
 * intentionally excluded from the authoritative new-write path.
 */
export function buildAgentArtifactCompletionMetadata(
  data: Record<string, unknown> | undefined,
  context: AgentArtifactCompletionContext,
): AgentArtifactCompletionMetadata {
  if (!data) {
    return {};
  }

  const references: AgentArtifactReference[] = [];
  for (const [kind, keys] of Object.entries(EXPLICIT_RESULT_ID_KEYS) as Array<
    [AgentArtifactRecordKind, { many: string; one: string }]
  >) {
    const ids = [
      ...(readString(data[keys.one]) ? [readString(data[keys.one])] : []),
      ...readStrings(data[keys.many]),
    ].filter((id): id is string => id !== undefined);
    for (const recordId of ids) {
      references.push(
        buildReference(
          kind,
          recordId,
          context.organizationId,
          context.brandId ?? context.scope?.brandId,
        ),
      );
    }
  }

  const suppliedPinIds = [
    ...(readString(data.artifactVersionPinId)
      ? [readString(data.artifactVersionPinId)]
      : []),
    ...readStrings(data.artifactVersionPinIds),
  ].filter((id): id is string => id !== undefined);
  const uniqueReferences = new Map<string, AgentArtifactReference>();
  for (const reference of references.slice(
    0,
    MAX_COMPLETION_ARTIFACT_REFERENCES,
  )) {
    uniqueReferences.set(`${reference.kind}:${reference.recordId}`, reference);
  }

  return {
    ...(uniqueReferences.size > 0
      ? { artifactReferences: [...uniqueReferences.values()] }
      : {}),
    ...(suppliedPinIds.length > 0
      ? {
          artifactVersionPinIds: [
            ...new Set(
              suppliedPinIds.slice(0, MAX_COMPLETION_ARTIFACT_REFERENCES),
            ),
          ],
        }
      : {}),
  };
}

export async function persistRunArtifacts(
  writer: AgentArtifactRunMetadataWriter,
  context: AgentArtifactCompletionContext,
  metadata: AgentArtifactCompletionMetadata,
): Promise<void> {
  if (
    !context.runId ||
    (!metadata.artifactReferences?.length &&
      !metadata.artifactVersionPinIds?.length)
  ) {
    return;
  }

  await writer.mergeMetadata(context.runId, context.organizationId, metadata);
}

export async function captureRunArtifacts(
  writer: AgentArtifactRunMetadataWriter,
  context: AgentArtifactCompletionContext,
  data: Record<string, unknown> | undefined,
): Promise<AgentArtifactCompletionMetadata> {
  const metadata = buildAgentArtifactCompletionMetadata(data, context);
  await persistRunArtifacts(writer, context, metadata);
  return metadata;
}
