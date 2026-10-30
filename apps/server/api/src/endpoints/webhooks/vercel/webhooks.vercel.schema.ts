import { z } from 'zod';

const vercelMetaSchema = z.looseObject({
  githubCommitMessage: z.string().nullish(),
  githubCommitSha: z.string().nullish(),
});

const vercelActorSchema = z.looseObject({
  name: z.string().nullish(),
  username: z.string().nullish(),
});

const vercelDeploymentSchema = z.looseObject({
  meta: vercelMetaSchema.nullish(),
  target: z.string().nullish(),
  url: z.string().nullish(),
});

const vercelEnvelopeFields = {
  alias: z.array(z.string()).nullish(),
  creator: vercelActorSchema.nullish(),
  deployment: vercelDeploymentSchema.nullish(),
  environment: z.string().nullish(),
  event: z.string().nullish(),
  id: z.string().nullish(),
  meta: vercelMetaSchema.nullish(),
  name: z.string().nullish(),
  project: z.looseObject({ name: z.string().nullish() }).nullish(),
  target: z.string().nullish(),
  type: z.string().nullish(),
  url: z.string().nullish(),
  user: vercelActorSchema.nullish(),
};

/**
 * Vercel deployment webhook body. Every field is optional and unknown keys are
 * kept: Vercel varies the envelope per event type, and the handler only reads
 * the fields below, so this guards their types without rejecting new events.
 */
export const vercelWebhookPayloadSchema = z.looseObject({
  ...vercelEnvelopeFields,
  payload: z.looseObject(vercelEnvelopeFields).nullish(),
});

export type ParsedVercelWebhookPayload = z.infer<
  typeof vercelWebhookPayloadSchema
>;
