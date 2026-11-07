import type {
  StoryboardPlan,
  StoryboardReferenceRole,
  StoryboardShot,
  StoryboardShotCut,
} from './storyboard-plan.contract';

const REGEX_SPECIAL_CHARS_PATTERN = /[.*+?^${}()|[\]\\]/g;

/** Role references go to the model in this order, after the shot's still. */
const ROLE_ORDER: readonly StoryboardReferenceRole[] = [
  'environment',
  'character_face',
  'character_body',
  'prop',
  'style',
];

const ROLE_PHRASES: Record<
  StoryboardReferenceRole,
  (label?: string) => string
> = {
  environment: (label) =>
    label ? `the environment (${label})` : 'the environment',
  character_face: (label) =>
    label ? `the face of ${label}` : "the main character's face",
  character_body: (label) =>
    label
      ? `the body and costume of ${label}`
      : "the main character's body and costume",
  prop: (label) => (label ? `the prop (${label})` : 'a prop'),
  style: () => 'the visual style to match',
};

function mentions(action: string, name: string): boolean {
  const escaped = name.replace(REGEX_SPECIAL_CHARS_PATTERN, '\\$&');
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(action);
}

/** The shot's speaker, then every other cast member its action names. */
export function storyboardShotCast(plan: StoryboardPlan, shot: StoryboardShot) {
  const speaker = plan.cast.find((member) => member.id === shot.speakerId);
  const cast = [
    ...(speaker ? [speaker] : []),
    ...plan.cast.filter(
      (member) => member !== speaker && mentions(shot.action, member.name),
    ),
  ];
  return { speaker, cast };
}

function seconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function cutLine(cut: StoryboardShotCut): string {
  const camera = cut.camera?.trim();
  return `${seconds(cut.startSeconds)}-${seconds(cut.endSeconds)}s: ${cut.framing.trim()}${camera ? `, ${camera}` : ''}.`;
}

/**
 * The references a shot names, in the order the video model receives them:
 * its current still (the first frame on image-to-video models), then the
 * images the person gave a role, by role.
 */
export function storyboardShotNamedReferences(shot: StoryboardShot) {
  const still =
    shot.stillFreshness === 'fresh' && shot.stillAssetId
      ? [
          {
            assetId: shot.stillAssetId,
            phrase: 'the opening frame',
            hasRole: false,
          },
        ]
      : [];
  const roles = ROLE_ORDER.flatMap((role) =>
    (shot.referenceRoles ?? [])
      .filter((reference) => reference.role === role)
      .map((reference) => ({
        assetId: reference.assetId,
        phrase: ROLE_PHRASES[role](reference.label?.trim() || undefined),
        hasRole: true,
      })),
  );
  const seen = new Set<string>();
  return [...still, ...roles].filter((reference) => {
    if (seen.has(reference.assetId)) return false;
    seen.add(reference.assetId);
    return true;
  });
}

export interface StoryboardShotPromptOptions {
  /** The model renders native audio: dialogue and sound effects enter the prompt. */
  readonly isAudioEnabled: boolean;
  /** The most image references the model accepts. */
  readonly maxReferences: number;
}

export interface StoryboardCompiledShotPrompt {
  readonly prompt: string;
  readonly referenceAssetIds: string[];
  /** Images the shot names; more than `maxReferences` blocks the quote. */
  readonly namedReferenceCount: number;
  /** True when the person wrote the prompt themselves. */
  readonly isCustom: boolean;
}

/**
 * The video prompt and references for one shot on one model (#9617). Named
 * references come first and the preamble says what each image is. Unnamed
 * cast and style references fill any room left. Timed cuts, the spoken line
 * and sound effects follow the action. A prompt the person wrote replaces
 * the compiled text; the references stay the same.
 */
export function compileStoryboardShotPrompt(
  plan: StoryboardPlan,
  shot: StoryboardShot,
  options: StoryboardShotPromptOptions,
): StoryboardCompiledShotPrompt {
  const limit = Math.max(0, options.maxReferences);
  const named = storyboardShotNamedReferences(shot);
  const { speaker, cast } = storyboardShotCast(plan, shot);
  const fill = [
    ...(shot.onScreenSpeaker && speaker?.avatarAssetId
      ? [speaker.avatarAssetId]
      : []),
    ...cast.flatMap((member) => member.referenceAssetIds),
    ...plan.styleReferenceAssetIds,
  ];
  const referenceAssetIds = [
    ...new Set([...named.map((reference) => reference.assetId), ...fill]),
  ].slice(0, limit);
  const sent = named.filter((reference) =>
    referenceAssetIds.includes(reference.assetId),
  );
  // The on-screen speaker's avatar is a cast reference too.
  const hasCastReferences = cast.some((member) =>
    [member.avatarAssetId, ...member.referenceAssetIds].some(
      (id) => id !== undefined && referenceAssetIds.includes(id),
    ),
  );
  const customPrompt = shot.videoPrompt?.trim();
  const prompt =
    customPrompt ||
    [
      // Without roles the images need no introduction.
      sent.some((reference) => reference.hasRole)
        ? `Reference images: ${sent
            .map(
              (reference, index) => `image ${index + 1} is ${reference.phrase}`,
            )
            .join('; ')}.`
        : '',
      shot.action.trim(),
      ...(shot.cuts ?? []).map(cutLine),
      options.isAudioEnabled && shot.dialogue?.trim()
        ? `Spoken line: "${shot.dialogue.trim()}"`
        : '',
      options.isAudioEnabled && shot.sfx?.length
        ? `Sound effects: ${shot.sfx.map((line) => line.trim()).join(', ')}.`
        : '',
      hasCastReferences
        ? 'Keep every person consistent with the reference images.'
        : '',
      plan.styleLabel?.trim() ? `Visual style: ${plan.styleLabel.trim()}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  return {
    prompt,
    referenceAssetIds,
    namedReferenceCount: named.length,
    isCustom: Boolean(customPrompt),
  };
}
