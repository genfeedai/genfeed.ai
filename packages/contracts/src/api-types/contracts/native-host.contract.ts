/** Shape validation never establishes authority; the host trusts only the browser-enforced origin. */
import { z } from 'zod';
import {
  NATIVE_HOST_FAILURE_CODES,
  NATIVE_HOST_PROTOCOL_VERSION,
  NATIVE_HOST_PROVIDER_IDS,
  NATIVE_HOST_VOICE_LIMITS,
} from '../../constants/native-host.constant';
import {
  REPLY_POST_MAX_INPUT_LENGTH,
  REPLY_VARIANT_TONES,
  REPLY_VARIANTS_MAX,
  TEXT_ACTION_MAX_INPUT_LENGTH,
  TEXT_ACTION_MODES,
} from '../../constants/text-action.constant';

const limits = NATIVE_HOST_VOICE_LIMITS;
const identifier = z.string().min(1).max(128);
const platform = z.string().trim().min(1).max(64);
const requestId = z.uuid();

function list(itemChars: number, maxItems: number) {
  return z.array(z.string().min(1).max(itemChars)).max(maxItems);
}

/**
 * The approved brand voice a local provider writes in: the text-relevant part
 * of the brand identity snapshot the extension read from Genfeed, bounded so a
 * request stays small. It is data for the prompt, never an instruction channel.
 */
export const nativeHostVoiceSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  brandId: identifier,
  contentHash: identifier,
  revisionId: identifier,
  resolvedAt: z.iso.datetime(),
  identity: z.strictObject({
    name: z.string().min(1).max(limits.nameChars),
    description: z.string().max(limits.identityChars).optional(),
    positioning: z.string().max(limits.identityChars).optional(),
    language: z.string().max(64).optional(),
  }),
  voice: z.strictObject({
    tone: z.string().max(limits.identityChars).optional(),
    style: z.string().max(limits.identityChars).optional(),
    audience: list(limits.listItemChars, limits.listItems),
    values: list(limits.listItemChars, limits.listItems),
    messagingPillars: list(limits.listItemChars, limits.listItems),
    avoid: list(limits.listItemChars, limits.listItems),
    sample: z.string().max(limits.sampleChars).optional(),
    guidelines: z.string().max(limits.guidelinesChars).optional(),
  }),
  rules: z.strictObject({
    mandatory: list(limits.listItemChars, limits.ruleItems),
    avoid: list(limits.listItemChars, limits.ruleItems),
    facts: list(limits.listItemChars, limits.ruleItems),
    examples: z
      .array(
        z.strictObject({
          polarity: z.enum(['positive', 'negative']),
          text: z.string().min(1).max(limits.examplesChars),
        }),
      )
      .max(limits.examples),
  }),
});

export const nativeHostProviderIdSchema = z.enum(NATIVE_HOST_PROVIDER_IDS);
export const nativeHostFailureCodeSchema = z.enum(NATIVE_HOST_FAILURE_CODES);

const version = z.literal(NATIVE_HOST_PROTOCOL_VERSION);

export const nativeHostTextActionSchema = z.strictObject({
  action: z.literal('refine_text'),
  mode: z.enum(TEXT_ACTION_MODES),
  platform,
  text: z
    .string()
    .refine((value) => value.trim().length > 0, 'text is required')
    .refine(
      (value) => value.length <= TEXT_ACTION_MAX_INPUT_LENGTH,
      `text must be at most ${TEXT_ACTION_MAX_INPUT_LENGTH} characters`,
    ),
});

export const nativeHostReplyActionSchema = z.strictObject({
  action: z.literal('generate_reply_variants'),
  platform,
  postAuthor: z.string().max(200).optional(),
  postContent: z
    .string()
    .refine((value) => value.trim().length > 0, 'postContent is required')
    .refine(
      (value) => value.length <= REPLY_POST_MAX_INPUT_LENGTH,
      `postContent must be at most ${REPLY_POST_MAX_INPUT_LENGTH} characters`,
    ),
  tone: z.enum(REPLY_VARIANT_TONES),
  variants: z.number().int().min(1).max(REPLY_VARIANTS_MAX),
});

export const nativeHostActionSchema = z.discriminatedUnion('action', [
  nativeHostTextActionSchema,
  nativeHostReplyActionSchema,
]);

export const nativeHostDetectRequestSchema = z.strictObject({
  requestId,
  type: z.literal('detect'),
  version,
});

export const nativeHostGenerateRequestSchema = z.strictObject({
  action: nativeHostActionSchema,
  providerId: nativeHostProviderIdSchema,
  requestId,
  type: z.literal('generate'),
  version,
  /** Null when the brand has no approved voice: the text is then written without voice context. */
  voice: nativeHostVoiceSnapshotV1Schema.nullable(),
});

export const nativeHostRequestSchema = z.discriminatedUnion('type', [
  nativeHostDetectRequestSchema,
  nativeHostGenerateRequestSchema,
]);

export const nativeHostProviderStatusSchema = z.strictObject({
  id: nativeHostProviderIdSchema,
  /** A CLI is found on PATH; an API provider has a key in the host config. Neither has been run. */
  isAvailable: z.boolean(),
  kind: z.enum(['cli', 'api']),
  label: z.string().min(1).max(64),
});

export const nativeHostDetectedResponseSchema = z.strictObject({
  hostVersion: z.string().min(1).max(32),
  providers: z
    .array(nativeHostProviderStatusSchema)
    .max(NATIVE_HOST_PROVIDER_IDS.length),
  requestId,
  type: z.literal('detected'),
  version,
});

const textActionResultSchema = z.strictObject({
  hasBrandVoice: z.boolean(),
  isReplayed: z.literal(false),
  maxCharacters: z.number().int().positive(),
  mode: z.enum(TEXT_ACTION_MODES),
  platform,
  text: z.string().min(1),
  voiceHint: z.string().max(500).optional(),
});

const replyVariantsResultSchema = z.strictObject({
  hasBrandVoice: z.boolean(),
  isReplayed: z.literal(false),
  maxCharacters: z.number().int().positive(),
  platform,
  tone: z.enum(REPLY_VARIANT_TONES),
  variants: z.array(z.string().min(1)).min(1).max(REPLY_VARIANTS_MAX),
  voiceHint: z.string().max(500).optional(),
});

export const nativeHostGeneratedTextResponseSchema = z.strictObject({
  action: z.literal('refine_text'),
  providerId: nativeHostProviderIdSchema,
  requestId,
  result: textActionResultSchema,
  type: z.literal('generated'),
  version,
});

export const nativeHostGeneratedRepliesResponseSchema = z.strictObject({
  action: z.literal('generate_reply_variants'),
  providerId: nativeHostProviderIdSchema,
  requestId,
  result: replyVariantsResultSchema,
  type: z.literal('generated'),
  version,
});

export const nativeHostFailedResponseSchema = z.strictObject({
  code: nativeHostFailureCodeSchema,
  message: z.string().min(1).max(500),
  /** Null when the request was too malformed to carry an id. */
  requestId: requestId.nullable(),
  type: z.literal('failed'),
  version,
});

export const nativeHostResponseSchema = z.union([
  nativeHostDetectedResponseSchema,
  nativeHostGeneratedTextResponseSchema,
  nativeHostGeneratedRepliesResponseSchema,
  nativeHostFailedResponseSchema,
]);

export type NativeHostVoiceSnapshotV1 = z.infer<
  typeof nativeHostVoiceSnapshotV1Schema
>;
export type NativeHostProviderId = z.infer<typeof nativeHostProviderIdSchema>;
export type NativeHostFailureCode = z.infer<typeof nativeHostFailureCodeSchema>;
export type NativeHostAction = z.infer<typeof nativeHostActionSchema>;
export type NativeHostRequest = z.infer<typeof nativeHostRequestSchema>;
export type NativeHostDetectRequest = z.infer<
  typeof nativeHostDetectRequestSchema
>;
export type NativeHostGenerateRequest = z.infer<
  typeof nativeHostGenerateRequestSchema
>;
export type NativeHostProviderStatus = z.infer<
  typeof nativeHostProviderStatusSchema
>;
export type NativeHostDetectedResponse = z.infer<
  typeof nativeHostDetectedResponseSchema
>;
export type NativeHostGeneratedResponse =
  | z.infer<typeof nativeHostGeneratedTextResponseSchema>
  | z.infer<typeof nativeHostGeneratedRepliesResponseSchema>;
export type NativeHostFailedResponse = z.infer<
  typeof nativeHostFailedResponseSchema
>;
export type NativeHostResponse = z.infer<typeof nativeHostResponseSchema>;
