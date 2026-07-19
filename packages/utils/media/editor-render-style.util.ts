import type {
  IEditorClip,
  IEditorEffect,
  IEditorTransition,
} from '@genfeedai/interfaces';

export interface EditorRenderStyle {
  clipPath?: string;
  filter: string;
  opacity?: number;
  transform?: string;
}

const CSS_FILTER_BUILDERS: Partial<
  Record<IEditorEffect['type'], (intensity: number) => string>
> = {
  blur: (intensity) => `blur(${(intensity / 100) * 20}px)`,
  brightness: (intensity) => `brightness(${(intensity / 50) * 100}%)`,
  contrast: (intensity) => `contrast(${(intensity / 50) * 100}%)`,
  grayscale: (intensity) => `grayscale(${intensity}%)`,
  saturation: (intensity) => `saturate(${(intensity / 50) * 100}%)`,
  sepia: (intensity) => `sepia(${intensity}%)`,
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function transitionProgress(
  frame: number,
  transition: IEditorTransition | undefined,
  direction: 'in' | 'out',
  durationInFrames: number,
): number {
  if (!transition || transition.type === 'none' || transition.duration === 0) {
    return direction === 'in' ? 1 : 0;
  }

  if (direction === 'in') {
    return clamp(frame / transition.duration);
  }

  return clamp(
    (frame - (durationInFrames - transition.duration)) / transition.duration,
  );
}

export function buildEditorCssFilter(effects: IEditorEffect[]): string {
  const filters = effects.flatMap((effect) => {
    const builder = CSS_FILTER_BUILDERS[effect.type];
    return builder ? [builder(effect.intensity)] : [];
  });

  return filters.length === 0 ? 'none' : filters.join(' ');
}

export function buildEditorRenderStyle(
  frame: number,
  clip: IEditorClip,
): EditorRenderStyle {
  const transitions = [
    {
      direction: 'in' as const,
      progress: transitionProgress(
        frame,
        clip.transitionIn,
        'in',
        clip.durationFrames,
      ),
      transition: clip.transitionIn,
    },
    {
      direction: 'out' as const,
      progress: transitionProgress(
        frame,
        clip.transitionOut,
        'out',
        clip.durationFrames,
      ),
      transition: clip.transitionOut,
    },
  ];
  let opacity = 1;
  let wipeLeft = 0;
  let wipeRight = 0;
  const transforms: string[] = [];

  for (const { direction, progress, transition } of transitions) {
    if (!transition || transition.type === 'none') {
      continue;
    }

    const visibleProgress = direction === 'in' ? progress : 1 - progress;
    if (transition.type === 'fade' || transition.type === 'dissolve') {
      opacity = Math.min(opacity, visibleProgress);
    } else if (transition.type === 'slide') {
      const offset =
        direction === 'in' ? (1 - progress) * 100 : -progress * 100;
      transforms.push(`translateX(${offset}%)`);
    } else if (transition.type === 'wipe') {
      if (direction === 'in') {
        wipeRight = Math.max(wipeRight, (1 - progress) * 100);
      } else {
        wipeLeft = Math.max(wipeLeft, progress * 100);
      }
    }
  }

  return {
    filter: buildEditorCssFilter(clip.effects),
    ...(opacity < 1 ? { opacity } : {}),
    ...(transforms.length > 0 ? { transform: transforms.join(' ') } : {}),
    ...(wipeLeft > 0 || wipeRight > 0
      ? { clipPath: `inset(0 ${wipeRight}% 0 ${wipeLeft}%)` }
      : {}),
  };
}
