import { VoiceProvider } from '@genfeedai/contracts';
import { z } from 'zod';

export const heyGenConnectionSchema = z.object({
  provider: z.literal('heygen'),
  kind: z.enum(['byok', 'platform']),
  organizationId: z.string().min(1),
  credentialVersionId: z.string().min(1).optional(),
});

export const heyGenAvatarRefSchema = z.object({
  version: z.literal(1),
  source: z.literal('heygen-look'),
  provider: z.literal('heygen'),
  lookId: z.string().trim().min(1),
  groupId: z.string().nullable(),
  ownership: z.enum(['private', 'public']),
  label: z.string(),
  preview: z.string().nullable(),
  avatarType: z.string().nullable(),
  supportedEngines: z.array(z.string()),
  readiness: z.object({
    lookStatus: z.string().nullable(),
    groupStatus: z.string().nullable(),
    consentStatus: z.string().nullable(),
    usable: z.boolean(),
    reason: z.string().nullable(),
  }),
  connection: heyGenConnectionSchema,
});

export const heyGenGenerationProviderSchema = z.object({
  version: z.literal(1),
  provider: z.literal('heygen'),
  organizationId: z.string().min(1),
  connection: heyGenConnectionSchema.extend({
    credentialVersionId: z.string().min(1),
  }),
  avatar: z.union([
    heyGenAvatarRefSchema,
    z.object({
      source: z.literal('photo'),
      ingredientId: z.string().optional(),
    }),
  ]),
  speech: z.object({
    provider: z.string(),
    externalVoiceId: z.string().optional(),
    audioIngredientId: z.string().optional(),
  }),
  submissionId: z.string().min(1),
});

export const heyGenAvatarCandidateSchema = z.object({
  source: z.literal('heygen-look').optional(),
  lookId: z.string().trim().min(1),
  groupId: z.string().nullable().optional(),
  ownership: z.enum(['public', 'private']),
  connection: heyGenConnectionSchema.optional(),
});

export const savedVoiceRefSchema = z.object({
  source: z.enum(['catalog', 'cloned']),
  provider: z.enum(VoiceProvider),
  internalVoiceId: z.string().min(1).optional(),
  externalVoiceId: z.string().min(1).optional(),
  label: z.string().optional(),
  preview: z.string().nullable().optional(),
  ownership: z.enum(['public', 'private']).optional(),
  connection: heyGenConnectionSchema.optional(),
});
