import {
  type AdPreset,
  type AdPresetParams,
  type AdPresetReference,
  type AdPresetSubmission,
  adPresetSubmissionSchema,
} from '../api-types/contracts/ad-preset.contract';
import {
  AdPresetCompileError,
  type AdPresetCompileErrorCode,
  compileAdPreset,
} from './ad-preset-compiler';

export type AdPresetReferenceKind = AdPresetReference['kind'];
export type AdPresetReferenceRole =
  AdPresetParams['referenceRoles'][number]['role'];

/** The form field an ad preset compile error belongs to, so it shows beside that field. */
export type AdPresetFormField =
  | 'dialogue'
  | 'duration'
  | 'form'
  | 'references'
  | 'voice';

export const AD_PRESET_ERROR_FIELDS: Readonly<
  Record<AdPresetCompileErrorCode, AdPresetFormField>
> = {
  DURATION_OUT_OF_RANGE: 'duration',
  DURATION_SHORTER_THAN_AUDIO: 'duration',
  INVALID_PARAMS: 'form',
  INVALID_PRESET: 'form',
  MISSING_AUDIO: 'voice',
  MISSING_DIALOGUE: 'dialogue',
  PROMPT_TOO_LONG: 'dialogue',
  REFERENCE_ROLE_MISMATCH: 'references',
  UNKNOWN_AUDIO_DURATION: 'voice',
  UNSUPPORTED_MODEL: 'form',
};

/** One attached reference in the order the person added it. */
export type AdPresetAttachment = {
  /** The ingredient id sent in `references`, `videoReferences` or `audioReferences`. */
  id: string;
  kind: AdPresetReferenceKind;
  role: AdPresetReferenceRole;
  /** Seconds. Required for audio. */
  duration?: number;
};

export type AdPresetRequestInput = {
  attachments: readonly AdPresetAttachment[];
  model: string;
  params: Omit<AdPresetParams, 'referenceRoles'>;
  preset: AdPreset;
  presetId: string;
  isDialogueCheckEnabled?: boolean;
};

export type AdPresetRequestPlan =
  | {
      isOk: true;
      /** What the generation request carries as `adPreset`. */
      submission: AdPresetSubmission;
      /** Ingredient ids per request field, in token order. */
      references: {
        audioReferences: string[];
        references: string[];
        videoReferences: string[];
      };
      /** Exactly what the server recompiles and sends to the model. */
      prompt: string;
      duration: number;
      notice: string;
    }
  | {
      isOk: false;
      code: AdPresetCompileErrorCode;
      field: AdPresetFormField;
      message: string;
    };

const TOKEN_PREFIX: Record<AdPresetReferenceKind, string> = {
  audio: 'Audio',
  image: 'Image',
  video: 'Video',
};

/**
 * Binds each attachment to the `@Image1`, `@Video1`, `@Audio1` token the server
 * will give it: one counter per kind, in attachment order.
 */
export function bindAdPresetReferences(
  attachments: readonly AdPresetAttachment[],
): {
  references: AdPresetReference[];
  referenceRoles: AdPresetParams['referenceRoles'];
} {
  const counts: Record<AdPresetReferenceKind, number> = {
    audio: 0,
    image: 0,
    video: 0,
  };
  const references: AdPresetReference[] = [];
  const referenceRoles: AdPresetParams['referenceRoles'] = [];
  for (const attachment of attachments) {
    const token = `@${TOKEN_PREFIX[attachment.kind]}${++counts[attachment.kind]}`;
    references.push({
      kind: attachment.kind,
      token,
      ...(attachment.duration === undefined
        ? {}
        : { duration: attachment.duration }),
    });
    referenceRoles.push({ role: attachment.role, token });
  }
  return { references, referenceRoles };
}

/**
 * The one place a Studio form or an agent turns an ad preset and its inputs
 * into a generation request. The server recompiles the same inputs with the
 * same compiler, so the prompt a person sees here is the prompt that is sent.
 */
export function planAdPresetRequest(
  input: AdPresetRequestInput,
): AdPresetRequestPlan {
  const { references, referenceRoles } = bindAdPresetReferences(
    input.attachments,
  );
  const params: AdPresetParams = { ...input.params, referenceRoles };
  try {
    const compiled = compileAdPreset({
      model: input.model,
      params,
      preset: input.preset,
      references,
    });
    const idsOf = (kind: AdPresetReferenceKind): string[] =>
      input.attachments
        .filter((attachment) => attachment.kind === kind)
        .map((attachment) => attachment.id);
    return {
      duration: compiled.duration,
      isOk: true,
      notice: compiled.notice,
      prompt: compiled.prompt,
      references: {
        audioReferences: idsOf('audio'),
        references: idsOf('image'),
        videoReferences: idsOf('video'),
      },
      submission: adPresetSubmissionSchema.parse({
        presetId: input.presetId,
        params,
        ...(input.isDialogueCheckEnabled === false
          ? { isDialogueCheckEnabled: false }
          : {}),
      }),
    };
  } catch (error) {
    if (!(error instanceof AdPresetCompileError)) throw error;
    return {
      code: error.code,
      field: AD_PRESET_ERROR_FIELDS[error.code],
      isOk: false,
      message: error.message,
    };
  }
}
