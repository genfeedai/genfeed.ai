import {
  type AdPreset,
  type AdPresetParams,
  type AdPresetReference,
  adPresetParamsSchema,
  adPresetReferenceSchema,
  adPresetSchema,
} from '../api-types/contracts/ad-preset.contract';
import { MINIMAX_H3_CAPABILITY_PROFILE as profile } from '../api-types/contracts/video-generation-capability-profile.contract';
import { AD_PRESET_AUDIO_NOTICE } from './ad-presets.constant';
import {
  getModelDurations,
  hasAudioReferences,
} from './model-helpers.constant';

export type AdPresetCompileErrorCode =
  | 'INVALID_PRESET'
  | 'INVALID_PARAMS'
  | 'MISSING_DIALOGUE'
  | 'MISSING_AUDIO'
  | 'UNSUPPORTED_MODEL'
  | 'UNKNOWN_AUDIO_DURATION'
  | 'DURATION_SHORTER_THAN_AUDIO'
  | 'DURATION_OUT_OF_RANGE'
  | 'PROMPT_TOO_LONG'
  | 'REFERENCE_ROLE_MISMATCH';

export class AdPresetCompileError extends Error {
  constructor(
    public readonly code: AdPresetCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdPresetCompileError';
  }
}

export type CompileAdPresetInput = {
  preset: AdPreset;
  params: AdPresetParams;
  references: readonly AdPresetReference[];
  model: string;
};

/** Pure compilation only. Reference audio steers the voice; it never guarantees unchanged audio. */
export function compileAdPreset(input: CompileAdPresetInput) {
  const preset = adPresetSchema.safeParse(input.preset);
  if (!preset.success)
    throw new AdPresetCompileError(
      'INVALID_PRESET',
      'Invalid ad preset section template.',
    );
  const parsedParams = adPresetParamsSchema.safeParse(input.params);
  if (!parsedParams.success)
    throw new AdPresetCompileError(
      'INVALID_PARAMS',
      'Invalid ad preset parameters.',
    );
  const params = parsedParams.data;
  const parsedReferences = adPresetReferenceSchema
    .array()
    .safeParse(input.references);
  if (!parsedReferences.success)
    throw new AdPresetCompileError(
      'REFERENCE_ROLE_MISMATCH',
      'Invalid attached reference.',
    );
  const references = parsedReferences.data;
  const audio = references.filter((reference) => reference.kind === 'audio');
  if (preset.data.speaking && !audio.length)
    throw new AdPresetCompileError(
      'MISSING_AUDIO',
      'Speaking presets require an audio reference.',
    );
  if (audio.length && !params.dialogue.trim())
    throw new AdPresetCompileError(
      'MISSING_DIALOGUE',
      'Dialogue is required with reference audio.',
    );
  if (input.model !== profile.modelKey || !hasAudioReferences(input.model))
    throw new AdPresetCompileError(
      'UNSUPPORTED_MODEL',
      'The model has no reviewed ad preset audio-reference capability.',
    );

  const seen = new Set<string>();
  const counts = { image: 0, video: 0, audio: 0 };
  const prefixes = { image: 'Image', video: 'Video', audio: 'Audio' };
  for (const reference of references) {
    const roles = params.referenceRoles.filter(
      (role) => role.token === reference.token,
    );
    const role = roles[0];
    if (
      seen.has(reference.token) ||
      reference.token !==
        `@${prefixes[reference.kind]}${++counts[reference.kind]}` ||
      roles.length !== 1 ||
      !role ||
      (reference.kind === 'audio') !== (role.role === 'voiceover')
    ) {
      throw new AdPresetCompileError(
        'REFERENCE_ROLE_MISMATCH',
        'Reference tokens must match attached slots and their media roles.',
      );
    }
    seen.add(reference.token);
  }
  if (
    params.referenceRoles.length !== references.length ||
    !references.some((reference) => reference.kind !== 'audio') ||
    counts.image > profile.references.max ||
    counts.video > profile.maxVideoReferences ||
    counts.audio > profile.maxAudioReferences ||
    references.length > 12
  ) {
    throw new AdPresetCompileError(
      'REFERENCE_ROLE_MISMATCH',
      'Every role needs a matching reference, within model limits, including an image or video.',
    );
  }
  let audioDuration = 0;
  for (const reference of audio) {
    const duration = reference.duration;
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
      throw new AdPresetCompileError(
        'UNKNOWN_AUDIO_DURATION',
        'Reference audio needs a known, positive clip duration.',
      );
    if (duration < 2 || duration > 15)
      throw new AdPresetCompileError(
        'DURATION_OUT_OF_RANGE',
        'H3 reference audio must be 2–15 seconds, with at most 15 seconds total.',
      );
    audioDuration += duration;
  }
  if (params.duration !== undefined && params.duration < audioDuration)
    throw new AdPresetCompileError(
      'DURATION_SHORTER_THAN_AUDIO',
      'Video duration cannot be shorter than reference audio.',
    );
  const duration =
    params.duration ??
    Math.max(profile.duration.minSeconds, Math.ceil(audioDuration));
  if (audioDuration > 15 || !getModelDurations(input.model).includes(duration))
    throw new AdPresetCompileError(
      'DURATION_OUT_OF_RANGE',
      'Choose a supported H3 duration from 4 to 15 seconds that fits all audio.',
    );
  if (!profile.aspectRatios.includes(params.aspectRatio))
    throw new AdPresetCompileError(
      'INVALID_PARAMS',
      'Unsupported model aspect ratio.',
    );

  const values: Record<string, string> = {
    aspectRatio: params.aspectRatio,
    dialogue: params.dialogue,
    duration: String(duration),
    lensMm: String(params.lensMm),
    qualityLook: params.qualityLook,
    referenceRoles: references
      .map(
        (reference) =>
          `${reference.token}: ${params.referenceRoles.find((role) => role.token === reference.token)?.role}`,
      )
      .join('\n'),
  };
  let dialogueSlots = 0;
  const prompt = preset.data.sections
    .map(
      (section) =>
        `## ${section.title}\n${section.template.replace(
          /\{\{(.*?)\}\}/g,
          (_match, key: string) => {
            if (
              !Object.hasOwn(values, key) ||
              (key === 'dialogue' && section.key !== 'dialogue')
            )
              throw new AdPresetCompileError(
                'INVALID_PRESET',
                'Unknown or misplaced template parameter.',
              );
            if (key === 'dialogue') dialogueSlots++;
            return values[key];
          },
        )}`,
    )
    .join('\n\n');
  if (
    dialogueSlots !== 1 ||
    !prompt.includes(AD_PRESET_AUDIO_NOTICE) ||
    !preset.data.sections
      .find((section) => section.key === 'dialogue')
      ?.template.includes('"{{dialogue}}"')
  )
    throw new AdPresetCompileError(
      'INVALID_PRESET',
      'Templates must include dialogue exactly once and the steer-only audio notice.',
    );
  for (const token of prompt.match(/@(Image|Video|Audio)\d+/g) ?? []) {
    if (!seen.has(token))
      throw new AdPresetCompileError(
        'REFERENCE_ROLE_MISMATCH',
        `No attached reference matches ${token}.`,
      );
  }
  if (prompt.length > profile.prompt.maxCharacters)
    throw new AdPresetCompileError(
      'PROMPT_TOO_LONG',
      `Prompt exceeds ${profile.prompt.maxCharacters} characters; shorten other sections or dialogue explicitly.`,
    );
  return { prompt, duration, notice: AD_PRESET_AUDIO_NOTICE };
}
