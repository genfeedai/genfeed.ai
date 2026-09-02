import type { SupportedAvatarVideoProviderName } from './avatar-video-provider.interface';
import type {
  ClipSourceArtifact,
  ClipSourceContract,
} from './clip-source.interface';
import type { ClipResultMode } from './clip-terminal-contract.interface';

export interface ClipAnalysisWorkflowInput {
  highlightFallback?: 'deterministic';
  highlightModel?: string;
  language: string;
  maxClips: number;
  minViralityScore: number;
  orgId: string;
  projectId: string;
  /** Authenticated Studio source lifecycle. Public acquisition may omit it. */
  source?: ClipSourceContract;
  userId: string;
  youtubeUrl: string;
}

export interface ClipAnalysisWorkflowResult {
  sourceArtifact?: ClipSourceArtifact;
}

export interface ClipGenerationReference {
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

export interface ClipFactoryWorkflowInput {
  avatarId?: string;
  avatarProvider?: SupportedAvatarVideoProviderName;
  language: string;
  maxClips: number;
  minViralityScore: number;
  mode?: ClipResultMode;
  orgId: string;
  projectId: string;
  referenceImageUrl?: string;
  /** Immutable tenant-authorized references resolved before credit checks. */
  runReferences?: readonly ClipGenerationReference[];
  /** Durable source lifecycle for authenticated Studio projects. */
  source?: ClipSourceContract;
  userId: string;
  voiceId?: string;
  youtubeUrl: string;
}
