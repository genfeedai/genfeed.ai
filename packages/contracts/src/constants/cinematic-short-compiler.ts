import {
  type CinematicShort,
  type CinematicShortPaletteStop,
  type CinematicShortShot,
  type CinematicShortSlots,
  cinematicShortSchema,
  cinematicShortSlotsSchema,
} from '../api-types/contracts/cinematic-short.contract';

export type CinematicShortCompileErrorCode =
  | 'INVALID_PRESET'
  | 'INVALID_SLOTS'
  | 'RUNTIME_OUT_OF_RANGE'
  | 'SHOT_TIMELINE_INVALID'
  | 'NAMED_STYLE_REFERENCE'
  | 'QA_LIMIT_ABOVE_PRESET';

export class CinematicShortCompileError extends Error {
  constructor(
    public readonly code: CinematicShortCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CinematicShortCompileError';
  }
}

export type CompileCinematicShortInput = {
  preset: CinematicShort;
  slots: CinematicShortSlots;
  brandName?: string;
};

export type CompiledCinematicShot = CinematicShortShot & {
  durationSeconds: number;
  frameCount: number;
  prompt: string;
};

export type CompiledCinematicShort = {
  aspectRatio: string;
  delivery: CinematicShort['delivery'];
  fps: number;
  frameCount: number;
  negativePrompt: string;
  paletteArc: CinematicShortPaletteStop[];
  prompt: string;
  qaPassLimit: number;
  runtimeSeconds: number;
  shots: CompiledCinematicShot[];
  soundSpec: string;
  titleCard: { sealText?: string; tagline?: string; text: string };
};

/**
 * Style is described by feel. A studio, artist or film name pulls the model
 * toward copying existing work, so the compiler refuses it instead of passing
 * it through.
 */
const NAMED_STYLE_REFERENCES = [
  'ghibli',
  'miyazaki',
  'pixar',
  'disney',
  'dreamworks',
  'shinkai',
  'kyoto animation',
  'studio trigger',
  'ufotable',
  'in the style of',
  'in the style',
  'style of',
  'à la',
] as const;

const TEMPLATE_VARIABLE_PATTERN =
  /\{\{(subject|setting|brand|titleText|tagline)\}\}/g;

function findNamedStyleReference(text: string): string | undefined {
  const lowered = text.toLowerCase();
  return NAMED_STYLE_REFERENCES.find((name) => lowered.includes(name));
}

function toFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (_match, name: string) => values[name] ?? '',
  );
}

/**
 * Pure compilation. Shot boundaries are snapped to whole frames, so every
 * shot is an exact number of frames and the shots tile the runtime with no
 * gap. The same input always gives the same output.
 */
export function compileCinematicShort(
  input: CompileCinematicShortInput,
): CompiledCinematicShort {
  const preset = cinematicShortSchema.safeParse(input.preset);
  if (!preset.success)
    throw new CinematicShortCompileError(
      'INVALID_PRESET',
      'The cinematic short preset does not match its schema.',
    );
  const slots = cinematicShortSlotsSchema.safeParse(input.slots);
  if (!slots.success)
    throw new CinematicShortCompileError(
      'INVALID_SLOTS',
      `Invalid slots: ${slots.error.issues
        .map((issue) => `${issue.path.join('.') || 'slots'} ${issue.message}`)
        .join('; ')}`,
    );
  const { data: definition } = preset;
  const { data: values } = slots;

  const styleByFeel = values.styleByFeel ?? definition.styleByFeel;
  const named = findNamedStyleReference(styleByFeel);
  if (named)
    throw new CinematicShortCompileError(
      'NAMED_STYLE_REFERENCE',
      `Describe the style by feel; do not name "${named}".`,
    );
  const qaPassLimit = values.qaPassLimit ?? definition.qaPassLimit;
  if (qaPassLimit > definition.qaPassLimit)
    throw new CinematicShortCompileError(
      'QA_LIMIT_ABOVE_PRESET',
      `This preset allows at most ${definition.qaPassLimit} QA passes.`,
    );

  const fps = values.fps ?? definition.fps;
  const sourceShots = values.shots ?? definition.shots;
  const sourceEnd = sourceShots[sourceShots.length - 1]?.endSeconds ?? 0;
  const sourceKeys = new Set(sourceShots.map((shot) => shot.key));
  const isContiguous = sourceShots.every(
    (shot, index) =>
      shot.endSeconds > shot.startSeconds &&
      (index === 0
        ? shot.startSeconds === 0
        : shot.startSeconds === sourceShots[index - 1]?.endSeconds),
  );
  if (!isContiguous || sourceKeys.size !== sourceShots.length)
    throw new CinematicShortCompileError(
      'SHOT_TIMELINE_INVALID',
      'Shots must start at 0, follow each other with no gap or overlap, and use unique keys.',
    );
  const runtimeSeconds = values.runtimeSeconds ?? sourceEnd;
  if (runtimeSeconds > definition.maxRuntimeSeconds)
    throw new CinematicShortCompileError(
      'RUNTIME_OUT_OF_RANGE',
      `Runtime is capped at ${definition.maxRuntimeSeconds} seconds for this preset.`,
    );

  const scale = runtimeSeconds / sourceEnd;
  const totalFrames = toFrames(runtimeSeconds, fps);
  const snappedRuntimeSeconds = totalFrames / fps;
  const boundary = (seconds: number, isLast: boolean) =>
    isLast ? totalFrames : toFrames(seconds * scale, fps);

  const templateValues: Record<string, string> = {
    brand: input.brandName?.trim() ?? '',
    setting: values.setting,
    subject: values.subject,
    tagline: values.tagline ?? '',
    titleText: values.titleText,
  };
  // Inherited stops sit on the preset's own timeline, so they scale against it
  // even when the caller replaced the shots.
  const presetEnd =
    definition.shots[definition.shots.length - 1]?.endSeconds ?? sourceEnd;
  const paletteScale = values.paletteArc ? scale : runtimeSeconds / presetEnd;
  const paletteArc = (values.paletteArc ?? definition.paletteArc)
    .map((stop) => ({
      ...stop,
      fromSecond: Math.round(stop.fromSecond * paletteScale * 1000) / 1000,
    }))
    .sort((left, right) => left.fromSecond - right.fromSecond);

  const hasEmptyShot = sourceShots.some(
    (shot, index) =>
      boundary(shot.endSeconds, index === sourceShots.length - 1) <=
      boundary(shot.startSeconds, false),
  );
  if (hasEmptyShot)
    throw new CinematicShortCompileError(
      'RUNTIME_OUT_OF_RANGE',
      'The runtime is too short for this shot list: a shot would have no frames.',
    );

  const shots = sourceShots.map((shot, index): CompiledCinematicShot => {
    const startFrame = boundary(shot.startSeconds, false);
    const endFrame = boundary(
      shot.endSeconds,
      index === sourceShots.length - 1,
    );
    const startSeconds = startFrame / fps;
    const endSeconds = endFrame / fps;
    const camera = fill(shot.camera, templateValues);
    const action = fill(shot.action, templateValues);
    const sound = fill(shot.sound, templateValues);
    const palette = [...paletteArc]
      .reverse()
      .find((stop) => stop.fromSecond <= startSeconds);
    return {
      ...shot,
      action,
      camera,
      durationSeconds: endSeconds - startSeconds,
      endSeconds,
      frameCount: endFrame - startFrame,
      prompt: [
        `${shot.title} (${startSeconds.toFixed(2)}s to ${endSeconds.toFixed(2)}s).`,
        `Camera: ${camera}`,
        `Action: ${action}`,
        palette ? `Light and palette: ${palette.name}, ${palette.palette}` : '',
        `Style: ${styleByFeel}`,
      ]
        .filter(Boolean)
        .join('\n'),
      sound,
      startSeconds,
    };
  });

  const soundSpec = values.soundSpec ?? definition.soundSpec;
  const negatives = [
    ...definition.negativeList,
    ...(values.extraNegatives ?? []),
  ];
  const titleCard = {
    ...(definition.titleCard.hasSeal && values.sealText
      ? { sealText: values.sealText }
      : {}),
    ...(values.tagline ? { tagline: values.tagline } : {}),
    text: values.titleText,
  };
  const deliveryFormat = values.deliveryFormat ?? definition.delivery.format;

  const prompt = [
    `## Film\n${definition.label}${input.brandName ? ` for ${input.brandName.trim()}` : ''}: ${values.subject} in ${values.setting}. ${snappedRuntimeSeconds} seconds, ${fps} fps, ${definition.aspectRatio}.`,
    `## Style\n${styleByFeel}`,
    `## Palette arc\n${paletteArc
      .map(
        (stop) => `- from ${stop.fromSecond}s, ${stop.name}: ${stop.palette}`,
      )
      .join('\n')}`,
    `## Shots\n${shots
      .map(
        (shot, index) =>
          `${index + 1}. ${shot.title} (${shot.startSeconds.toFixed(2)}s to ${shot.endSeconds.toFixed(2)}s)\n   Camera: ${shot.camera}\n   Action: ${shot.action}\n   Sound: ${shot.sound}`,
      )
      .join('\n')}`,
    `## Sound\n${soundSpec}`,
    `## Title card\n${definition.titleCard.treatment}\nText: ${titleCard.text}${
      titleCard.tagline ? `\nLine below: ${titleCard.tagline}` : ''
    }${titleCard.sealText ? `\nSeal: ${titleCard.sealText}` : ''}`,
    `## Avoid\n${negatives.map((negative) => `- ${negative}`).join('\n')}`,
  ].join('\n\n');

  return {
    aspectRatio: definition.aspectRatio,
    delivery: {
      format: deliveryFormat,
      hasSound: definition.delivery.hasSound,
    },
    fps,
    frameCount: totalFrames,
    negativePrompt: negatives.join(', '),
    paletteArc,
    prompt,
    qaPassLimit,
    runtimeSeconds: snappedRuntimeSeconds,
    shots,
    soundSpec,
    titleCard,
  };
}
