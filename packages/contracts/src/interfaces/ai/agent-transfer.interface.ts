import type { AgentTransferDeliveryMode, AgentTransferStatus } from '../..';
import type { AgentArtifactReference } from './agent-artifact-reference.interface';

export interface AgentTransferPresentation {
  id: string;
  sourceThreadId: string;
  destinationThreadId: string;
  sourceThreadTitle?: string | null;
  destinationThreadTitle?: string | null;
  sourceBrandId?: string | null;
  destinationBrandId?: string | null;
  deliveryMode: AgentTransferDeliveryMode;
  status: AgentTransferStatus;
  direction: 'inbound' | 'outbound';
  content: string;
  completionSummary?: string | null;
  failureReason?: string | null;
  progress: number;
  retryCount: number;
  artifactReferences?: AgentArtifactReference[];
  outputArtifactReferences?: AgentArtifactReference[];
  destinationExecutionId?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface IAgentTransfer
  extends Omit<AgentTransferPresentation, 'direction'> {
  organization: string;
  user: string;
  idempotencyKey: string;
  correlationId: string;
  parentCorrelationId?: string | null;
  depth: number;
  selectedContext?: Record<string, unknown>;
  artifactVersionPinIds?: string[];
  outputArtifactVersionPinIds?: string[];
  sourceMessageId?: string | null;
  destinationMessageId?: string | null;
  deliveredAt?: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  lastAttemptAt?: string | null;
  updatedAt: string;
}
