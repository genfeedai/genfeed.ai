export interface VideoCreationParams {
  title: string;
  description: string;
  style?: string;
  duration?: number;
  voiceOver?: {
    enabled: boolean;
    voice?: string;
  };
}

export interface VideoResponse {
  id: string;
  status: string;
  estimatedCompletion: string;
  title?: string;
  createdAt?: string;
  duration?: number;
  url?: string;
  views?: number;
  /** Permanent origin: UPLOADED, GENERATED, IMPORTED or UNKNOWN. */
  origin?: string;
}

/** Body for `POST /videos/merge`. Zoom fields are not part of this contract. */
export interface MergeVideosParams {
  ids: string[];
  isCaptionsEnabled?: boolean;
  isMuteVideoAudio?: boolean;
  isResizeEnabled?: boolean;
  music?: string;
  musicVolume?: number;
  transition?: string;
  transitionDuration?: number;
  transitionEaseCurve?: string;
}

export interface MergeVideosResult {
  id: string;
  status: string;
}

/** JSON:API resource, or a flat `{ id, status }` body, from `POST /videos/merge`. */
export interface MergeVideoResource {
  attributes?: { status?: string };
  id?: string;
  status?: string;
}
