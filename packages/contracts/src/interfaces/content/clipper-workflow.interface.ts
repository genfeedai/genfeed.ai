import type { HeyGenAvatarRef } from '../integrations/heygen.interface';
import type { IBrandAgentConfig } from '../organization/brand.interface';
import type { SupportedAvatarVideoProviderName } from './avatar-video-provider.interface';
import type {
  ClipperSourceArtifact,
  ClipperSourceContract,
} from './clipper-source.interface';
import type { ClipperResultMode } from './clipper-terminal-contract.interface';

export interface ClipperAnalysisWorkflowInput {
  highlightFallback?: 'deterministic';
  highlightModel?: string;
  language: string;
  maxClips: number;
  minViralityScore: number;
  orgId: string;
  projectId: string;
  /** Authenticated Studio source lifecycle. Public acquisition may omit it. */
  source?: ClipperSourceContract;
  userId: string;
  youtubeUrl: string;
}

export interface ClipperAnalysisWorkflowResult {
  sourceArtifact?: ClipperSourceArtifact;
}

export interface ClipperGenerationReference {
  assetId: string;
  description?: string;
  role:
    | 'subject'
    | 'character'
    | 'product'
    | 'style'
    | 'composition'
    | 'first_frame'
    | 'last_frame'
    | 'reference_video';
  url: string;
}

export interface ClipperFactoryWorkflowInput {
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  avatarId?: string;
  avatarProvider?: SupportedAvatarVideoProviderName;
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode?: ClipperResultMode;
  orgId: string;
  projectId: string;
  referenceImageUrl?: string;
  /** Immutable tenant-authorized references resolved before credit checks. */
  runReferences?: readonly ClipperGenerationReference[];
  /** Durable source lifecycle for authenticated Studio projects. */
  source?: ClipperSourceContract;
  userId: string;
  voiceId?: string;
  youtubeUrl: string;
}
