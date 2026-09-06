import type { RefObject, VideoHTMLAttributes } from 'react';

export interface VideoPlayerProps {
  ariaLabel?: string;
  isActive?: boolean;
  mediaClassName?: string;
  mediaProps?: Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    'children' | 'src' | 'className'
  >;
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

export interface VideoPlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  onPlaybackError: () => void;
}
