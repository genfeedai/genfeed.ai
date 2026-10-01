import { z } from 'zod';

export const AGENT_SOURCE_KINDS = [
  'imported_posts',
  'saved_ads',
  'owned_outlier_posts',
  'trends',
  'long_form_videos',
] as const;
export const AGENT_SOURCE_OUTPUT_KINDS = [
  'copy',
  'image',
  'video',
  'avatar',
  'clips',
] as const;
export const DEFAULT_AGENT_SOURCE_KINDS = Object.freeze([
  'imported_posts',
  'saved_ads',
] as const);
export const DEFAULT_AGENT_SOURCE_LIMIT = 1;
export const DEFAULT_AGENT_SOURCE_OUTPUT_KINDS = Object.freeze([
  'copy',
] as const);
export type AgentSourceKind = (typeof AGENT_SOURCE_KINDS)[number];
export type AgentSourceOutputKind = (typeof AGENT_SOURCE_OUTPUT_KINDS)[number];
export interface AgentSourcePolicy {
  readonly version: 1;
  readonly enabledKinds: readonly AgentSourceKind[];
  readonly perRunSourceLimit: number;
  readonly outputKinds: readonly AgentSourceOutputKind[];
  readonly clipsEnabled: boolean;
  readonly clipMode?: 'avatar' | 'raw-cut';
  readonly freshnessWindowMs: number;
}

const policySchema = z
  .object({
    version: z.literal(1).default(1),
    enabledKinds: z
      .array(z.enum(AGENT_SOURCE_KINDS))
      .default([...DEFAULT_AGENT_SOURCE_KINDS]),
    perRunSourceLimit: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_AGENT_SOURCE_LIMIT),
    outputKinds: z
      .array(z.enum(AGENT_SOURCE_OUTPUT_KINDS))
      .min(1)
      .default([...DEFAULT_AGENT_SOURCE_OUTPUT_KINDS]),
    clipsEnabled: z.boolean().default(false),
    clipMode: z.enum(['avatar', 'raw-cut']).optional(),
    freshnessWindowMs: z.number().positive().optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      new Set(policy.enabledKinds).size !== policy.enabledKinds.length ||
      new Set(policy.outputKinds).size !== policy.outputKinds.length
    ) {
      context.addIssue({ code: 'custom', message: 'Duplicate policy kind' });
    }
    if (
      policy.clipsEnabled !== policy.outputKinds.includes('clips') ||
      policy.clipsEnabled !== (policy.clipMode !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Clips require an explicit mode and clips output',
      });
    }
  });

/** Defaults normalize omitted settings; they never authorize generation or activation. */
export function resolveAgentSourcePolicy(
  input: unknown,
  explicitFreshnessWindowMs: number,
): AgentSourcePolicy {
  const freshness = z.number().positive().parse(explicitFreshnessWindowMs);
  const parsed = policySchema.parse(input === undefined ? {} : input);
  return Object.freeze({
    ...parsed,
    enabledKinds: Object.freeze(parsed.enabledKinds),
    outputKinds: Object.freeze(parsed.outputKinds),
    freshnessWindowMs: parsed.freshnessWindowMs ?? freshness,
  });
}
