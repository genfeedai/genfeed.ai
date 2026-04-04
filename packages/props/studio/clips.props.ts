// ─── Shared Types ─────────────────────────────────────────────────

export type AvatarProvider = 'heygen' | 'did' | 'tavus' | 'musetalk';

export type ClipStatus =
  | 'pending'
  | 'extracting'
  | 'captioning'
  | 'completed'
  | 'failed';

export type ClipsStep = 'input' | 'review' | 'progress';

// ─── Data Interfaces ──────────────────────────────────────────────

export interface ProviderOption {
  value: AvatarProvider;
  label: string;
  description: string;
  disabled: boolean;
}

export interface IHighlight {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export interface ClipResult {
  _id: string;
  title: string;
  summary: string;
  viralityScore: number;
  status: ClipStatus;
  videoUrl?: string;
  captionedVideoUrl?: string;
  clipType?: string;
  duration: number;
  startTime: number;
  endTime: number;
  tags: string[];
}

export interface ProjectState {
  projectId: string;
  status: string;
  highlights: IHighlight[];
  clips: ClipResult[];
}

// ─── Component Props ──────────────────────────────────────────────

export interface ViralityBadgeProps {
  score: number;
}
