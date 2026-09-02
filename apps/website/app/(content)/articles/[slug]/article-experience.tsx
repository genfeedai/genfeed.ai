'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Slider } from '@ui/primitives/slider';
import { ArrowUpRight, RotateCcw, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

const FILMMAKING_LEXICON_SLUG = 'how-to-prompt-ai-images-videos-and-audio';

type FilmmakingEffectKind =
  | 'color-grade'
  | 'dolly-zoom'
  | 'film-grain'
  | 'rack-focus'
  | 'vignette'
  | 'whip-pan';

interface FilmmakingEffect {
  controlLabel: string;
  description: string;
  kind: FilmmakingEffectKind;
  label: string;
  prompt: string;
}

const DEFAULT_FILMMAKING_EFFECT: FilmmakingEffect = {
  controlLabel: 'Grain strength',
  description:
    'Adds fine luminance variation so digitally clean footage feels tactile. Keep skin detail visible; heavy grain reads as damage, not film.',
  kind: 'film-grain',
  label: 'Film grain',
  prompt:
    'Create a cinematic video with fine 35mm film grain, subtle luminance texture, preserved skin detail, and no compression artifacts.',
};

const FILMMAKING_EFFECTS: readonly FilmmakingEffect[] = [
  DEFAULT_FILMMAKING_EFFECT,
  {
    controlLabel: 'Edge falloff',
    description:
      'Darkens the edge of the frame to keep attention on the subject. The effect should guide the eye before the viewer consciously notices it.',
    kind: 'vignette',
    label: 'Vignette',
    prompt:
      'Create a cinematic shot with a restrained natural vignette that guides attention to the central subject without crushing edge detail.',
  },
  {
    controlLabel: 'Focus shift',
    description:
      'Moves focus between depth planes without cutting. It is useful when the audience needs to discover a second subject in the same composition.',
    kind: 'rack-focus',
    label: 'Rack focus',
    prompt:
      'Create a rack-focus shot that begins on the foreground subject, then smoothly shifts focus to the background subject while the camera stays locked.',
  },
  {
    controlLabel: 'Perspective change',
    description:
      'Moves the camera while changing focal length in the opposite direction. The subject stays similar in size while the background appears to stretch.',
    kind: 'dolly-zoom',
    label: 'Dolly zoom',
    prompt:
      'Create a controlled dolly-zoom shot: move the camera backward while zooming in so the subject stays the same size and the background perspective expands.',
  },
  {
    controlLabel: 'Pan speed',
    description:
      'A very fast pan turns the frame into directional blur. It can add energy or hide a transition between two matched movements.',
    kind: 'whip-pan',
    label: 'Whip pan',
    prompt:
      'Create a fast left-to-right whip pan with strong horizontal motion blur, a clean acceleration and deceleration curve, and a stable landing frame.',
  },
  {
    controlLabel: 'Grade strength',
    description:
      'Shapes contrast and colour after capture. A warm grade can suggest intimacy or late-day light, but it should preserve believable neutrals.',
    kind: 'color-grade',
    label: 'Warm grade',
    prompt:
      'Apply a restrained warm cinematic colour grade with amber highlights, natural skin tones, slightly cool shadows, and preserved neutral whites.',
  },
] as const;

interface PreviewStyle {
  backgroundBlur: number;
  backgroundScale: number;
  backgroundTranslate: number;
  foregroundBlur: number;
  foregroundScale: number;
  foregroundTranslate: number;
  grainOpacity: number;
  sceneFilter: string;
  vignetteOpacity: number;
}

function getPreviewStyle(
  effect: FilmmakingEffectKind,
  intensity: number,
  isApplied: boolean,
): PreviewStyle {
  const base: PreviewStyle = {
    backgroundBlur: 0,
    backgroundScale: 1,
    backgroundTranslate: 0,
    foregroundBlur: 0,
    foregroundScale: 1,
    foregroundTranslate: 0,
    grainOpacity: 0,
    sceneFilter: 'none',
    vignetteOpacity: 0,
  };

  if (!isApplied) {
    return base;
  }

  const strength = intensity / 100;

  switch (effect) {
    case 'film-grain':
      return { ...base, grainOpacity: strength * 0.72 };
    case 'vignette':
      return { ...base, vignetteOpacity: strength * 0.86 };
    case 'rack-focus':
      return {
        ...base,
        backgroundBlur: (1 - strength) * 7,
        foregroundBlur: strength * 7,
      };
    case 'dolly-zoom':
      return {
        ...base,
        backgroundScale: 1 + strength * 0.3,
        foregroundScale: 1 - strength * 0.08,
      };
    case 'whip-pan':
      return {
        ...base,
        backgroundBlur: strength * 5,
        backgroundTranslate: strength * -14,
        foregroundBlur: strength * 3,
        foregroundTranslate: strength * -22,
      };
    case 'color-grade':
      return {
        ...base,
        sceneFilter: `sepia(${strength * 0.42}) saturate(${1 + strength * 0.55}) contrast(${1 + strength * 0.12})`,
      };
  }
}

function EffectPreview({
  effect,
  intensity,
  isApplied,
}: {
  effect: FilmmakingEffect;
  intensity: number;
  isApplied: boolean;
}): React.ReactElement {
  const preview = getPreviewStyle(effect.kind, intensity, isApplied);

  return (
    <figure className="m-0 overflow-hidden border border-edge/[0.08] bg-background">
      <div
        aria-label={`${effect.label} ${isApplied ? 'applied' : 'before'} preview`}
        className="relative aspect-video overflow-hidden bg-gradient-to-b from-fill/20 via-fill/10 to-background"
        role="img"
        style={{ filter: preview.sceneFilter }}
      >
        <div
          className="absolute inset-0 transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{
            filter: `blur(${preview.backgroundBlur}px)`,
            transform: `translateX(${preview.backgroundTranslate}%) scale(${preview.backgroundScale})`,
          }}
        >
          <div className="absolute left-[12%] top-[16%] size-20 rounded-full bg-surface/10 md:size-28" />
          <div
            className="absolute inset-x-[-10%] bottom-[22%] h-[48%] bg-fill/20"
            style={{
              clipPath:
                'polygon(0 82%, 18% 38%, 34% 72%, 53% 20%, 72% 68%, 88% 34%, 100% 78%, 100% 100%, 0 100%)',
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[28%] bg-fill/30" />
          <div className="absolute right-[15%] top-[30%] h-24 w-10 bg-surface/15 md:h-32 md:w-14" />
        </div>

        <div
          className="absolute bottom-[15%] left-1/2 h-[48%] w-[18%] -translate-x-1/2 transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{
            filter: `blur(${preview.foregroundBlur}px)`,
            transform: `translateX(calc(-50% + ${preview.foregroundTranslate}%)) scale(${preview.foregroundScale})`,
          }}
        >
          <div className="mx-auto size-10 rounded-full bg-surface/90 md:size-14" />
          <div className="mx-auto h-[72%] w-full rounded-t-full bg-surface/80" />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-500"
          style={{
            backgroundImage:
              'repeating-radial-gradient(circle at 17% 32%, rgba(255,255,255,0.32) 0 0.6px, transparent 0.8px 3px)',
            opacity: preview.grainOpacity,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.92) 100%)',
            opacity: preview.vignetteOpacity,
          }}
        />

        <div className="absolute left-3 top-3 bg-background/80 px-2 py-1 text-2xs font-medium uppercase tracking-[0.14em] text-surface/70 backdrop-blur-sm">
          {isApplied ? effect.label : 'Before'}
        </div>
      </div>
      <figcaption className="border-t border-edge/[0.08] px-4 py-3 text-sm text-surface/60">
        A simplified preview isolates the visual principle. Real output also
        depends on the source, model, duration, and shot composition.
      </figcaption>
    </figure>
  );
}

function FilmmakingEffectLab(): React.ReactElement {
  const [selectedKind, setSelectedKind] =
    useState<FilmmakingEffectKind>('film-grain');
  const [intensity, setIntensity] = useState(60);
  const [isApplied, setIsApplied] = useState(true);
  const selectedEffect =
    FILMMAKING_EFFECTS.find((effect) => effect.kind === selectedKind) ??
    DEFAULT_FILMMAKING_EFFECT;
  const applyHref = useMemo(
    () =>
      `${EnvironmentService.apps.app}${buildAgentPromptHref(selectedEffect.prompt)}`,
    [selectedEffect.prompt],
  );

  return (
    <section
      aria-labelledby="filmmaking-effect-lab-title"
      className="mb-8 border-y border-edge/[0.08] bg-fill/[0.04] py-6 md:px-6"
    >
      <div className="mb-5 flex items-start gap-3 px-4 md:px-0">
        <div className="mt-0.5 bg-fill/10 p-2 text-surface">
          <Sparkles className="size-4" aria-hidden="true" />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-surface/50">
            Interactive filmmaking lexicon
          </p>
          <h2
            className="text-xl font-semibold text-surface md:text-2xl"
            id="filmmaking-effect-lab-title"
          >
            See the effect, then apply it
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-surface/65">
            Select a term, change its strength, and compare the untreated frame
            with the effect. The handoff opens Genfeed with a production-ready
            starting prompt.
          </p>
        </div>
      </div>

      <div className="grid gap-6 px-4 md:px-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]">
        <EffectPreview
          effect={selectedEffect}
          intensity={intensity}
          isApplied={isApplied}
        />

        <div className="flex flex-col gap-5">
          <fieldset
            aria-label="Choose a filmmaking effect"
            className="m-0 grid grid-cols-2 gap-1 border-0 p-0"
          >
            {FILMMAKING_EFFECTS.map((effect) => (
              <Button
                aria-pressed={selectedKind === effect.kind}
                className="justify-start border border-edge/[0.08] px-3 py-2 text-left text-sm text-surface/60 transition-colors hover:bg-fill/10 hover:text-surface aria-pressed:bg-fill/15 aria-pressed:text-surface"
                key={effect.kind}
                onClick={() => {
                  setSelectedKind(effect.kind);
                  setIsApplied(true);
                }}
                textTransform="none"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                {effect.label}
              </Button>
            ))}
          </fieldset>

          <div aria-live="polite">
            <h3 className="text-base font-semibold text-surface">
              {selectedEffect.label}
            </h3>
            <p className="mt-1 text-sm leading-6 text-surface/65">
              {selectedEffect.description}
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-surface/60">
              <span>{selectedEffect.controlLabel}</span>
              <span>{intensity}%</span>
            </div>
            <Slider
              aria-label={selectedEffect.controlLabel}
              max={100}
              min={0}
              onValueChange={([value]) => {
                setIntensity(value ?? 0);
                setIsApplied(true);
              }}
              step={5}
              value={[intensity]}
            />
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              onClick={() => setIsApplied((current) => !current)}
              variant={ButtonVariant.SECONDARY}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {isApplied ? 'Show before' : 'Apply effect'}
            </Button>
            <Button asChild withWrapper={false}>
              <a href={applyHref} target="_blank" rel="noopener noreferrer">
                Use in Genfeed
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ArticleExperience({
  slug,
}: {
  slug?: string;
}): React.ReactElement | null {
  if (slug !== FILMMAKING_LEXICON_SLUG) {
    return null;
  }

  return <FilmmakingEffectLab />;
}
