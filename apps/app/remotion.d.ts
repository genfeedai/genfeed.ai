/**
 * Remotion module declarations.
 * These are fallbacks for when TypeScript can't resolve remotion types
 * from transitive imports in shared page modules.
 * The actual types from node_modules/@remotion/player take precedence.
 */
declare module '@remotion/player' {
  import type { ComponentType } from 'react';

  export interface PlayerRef {
    play: () => void;
    pause: () => void;
    toggle: () => void;
    seekTo: (frame: number) => void;
    getCurrentFrame: () => number;
    isPlaying: () => boolean;
    addEventListener: (event: string, handler: () => void) => void;
    removeEventListener: (event: string, handler: () => void) => void;
  }

  export const Player: React.ForwardRefExoticComponent<
    {
      component: ComponentType<unknown>;
      durationInFrames: number;
      compositionWidth: number;
      compositionHeight: number;
      fps: number;
      style?: React.CSSProperties;
      inputProps?: Record<string, unknown>;
      controls?: boolean;
      loop?: boolean;
      autoPlay?: boolean;
      clickToPlay?: boolean;
    } & React.RefAttributes<PlayerRef>
  >;
}

declare module 'remotion' {
  import type { ComponentType, ReactNode } from 'react';

  export const AbsoluteFill: ComponentType<{
    children?: ReactNode;
    style?: React.CSSProperties;
    className?: string;
  }>;

  export const Sequence: ComponentType<{
    from: number;
    durationInFrames: number;
    children?: ReactNode;
    name?: string;
  }>;

  export const Composition: ComponentType<{
    id: string;
    component: ComponentType<unknown>;
    fps: number;
    width: number;
    height: number;
    durationInFrames: number;
    defaultProps?: Record<string, unknown>;
    calculateMetadata?: (args: { props: Record<string, unknown> }) => {
      durationInFrames: number;
      fps: number;
      height: number;
      width: number;
    };
  }>;

  export const Audio: ComponentType<{
    src: string;
    volume?: number;
    startFrom?: number;
    endAt?: number;
  }>;

  export const OffthreadVideo: ComponentType<{
    src: string;
    style?: React.CSSProperties;
    volume?: number;
    startFrom?: number;
    endAt?: number;
  }>;

  export const Img: ComponentType<{
    src: string;
    style?: React.CSSProperties;
  }>;

  export function registerRoot(comp: React.FC): void;

  export function useVideoConfig(): {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };
}
