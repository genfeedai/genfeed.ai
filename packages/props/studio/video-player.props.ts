import type { RefObject } from 'react';

export interface VideoPlayerProps {
  videoRef?: RefObject<HTMLVideoElement | null>;
  src?: string;
  thumbnail?: string;
  className?: string;
  priority?: boolean;
  onLoad?: () => void;
  config?: {
    controls: boolean;
    muted: boolean;
    loop: boolean;
    playsInline: boolean;
    autoPlay?: boolean;
    preload: 'none' | 'metadata' | 'auto';
  };
}
