import type { HiddenExecutionRef } from '@api/authorization/brand-access/hidden-execution-chain.util';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import type { ContextEntryKnowledgeLink } from '@api/collections/contexts/schemas/context-entry.schema';
import type {
  ContextEmbeddingJob,
  ContextEntry as StoredContextEntry,
} from '@genfeedai/prisma';

/** Captured only at authenticated operations or from actual committed background sources. */
export type ContextEmbeddingAdmissionPrincipal =
  | { origin: 'ACTOR'; actor: WorkflowInitiatingActor; sourceMemoryId?: string }
  | {
      origin: 'CODE_OWNED_WORKFLOW';
      provenance: HiddenExecutionRef & { nodeId: string; actionId: string };
    }
  | { origin: 'DERIVED_MEMORY'; sourceMemoryId: string };

export type ContextMemoryCaptureAuthority =
  | { origin: 'ACTOR'; actor: WorkflowInitiatingActor }
  | { origin: 'DERIVED_MEMORY' };

export interface ContextEmbeddingWriteInput {
  contextBaseId: string;
  dto: AddEntryDto;
  organizationId: string;
  knowledgeLink?: ContextEntryKnowledgeLink;
  principal: ContextEmbeddingAdmissionPrincipal;
}

export interface ContextEmbeddingClaim {
  job: ContextEmbeddingJob;
  entry: StoredContextEntry;
  content: string;
  leaseToken: string;
}

export type ContextEmbeddingSourceEligibility =
  | 'eligible'
  | 'deferred'
  | 'cancelled';

export interface KnowledgeEmbeddingChunk {
  content: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeEmbeddingStageInput {
  organizationId: string;
  sourceId: string;
  versionId: string;
  contextBaseId: string;
  admissionExecutionId: string;
  initiatingActor: WorkflowInitiatingActor;
  chunks: KnowledgeEmbeddingChunk[];
  observedValidators: { etag?: string; lastModified?: string };
}
