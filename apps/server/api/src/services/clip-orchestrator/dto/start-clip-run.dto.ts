import type { GenerationBriefReference } from '@api-types/contracts/generation-brief.contract';

/**
 * Input DTO to start a clip orchestration run.
 */
export interface StartClipRunDto {
  /** Brand kit to resolve once into immutable references for this run. */
  brandId?: string;

  /** Already-preflighted references supplied by a generation entry point. */
  runReferences?: readonly GenerationBriefReference[];

  /** Clip project ID to orchestrate. */
  projectId: string;

  /** User who initiated the run. */
  userId: string;

  /** Organization that owns the project. */
  organizationId: string;

  /** When true, pause at checkpoint transitions and require user confirmation. */
  confirmationRequired?: boolean;

  /** Skip the merging step (e.g. single-clip projects). */
  skipMerging?: boolean;

  /** Optional workflow ID to bind this run to. */
  workflowId?: string;

  /** Arbitrary metadata passed through the pipeline. */
  metadata?: Record<string, unknown>;
}
