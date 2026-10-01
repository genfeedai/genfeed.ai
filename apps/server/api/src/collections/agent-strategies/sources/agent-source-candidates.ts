import {
  type AgentSourceKind,
  type AgentSourcePolicy,
  resolveAgentSourcePolicy,
} from '@api/collections/agent-strategies/sources/agent-source-policy';
import type { BrandRemixSourceSelector } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { z } from 'zod';

export const agentSourceIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/);
export const agentSourceTimestampSchema = z.iso.datetime({ offset: true });
export interface AgentSourceScope {
  readonly organizationId: string;
  readonly brandId: string;
}
export type AgentSourceSelector =
  | Readonly<
      Extract<
        BrandRemixSourceSelector,
        { kind: 'source_post' | 'saved_ad' | 'owned_post' | 'trend_reference' }
      >
    >
  | Readonly<{ kind: 'library_video'; ingredientId: string }>
  | Readonly<{ kind: 'clip_project'; clipProjectId: string }>;
export type AgentSourceIdentityKind = AgentSourceSelector['kind'];
export interface AgentSourceCandidate {
  readonly scope: AgentSourceScope;
  readonly sourceKind: AgentSourceIdentityKind;
  readonly sourceId: string;
  readonly selector: AgentSourceSelector;
  readonly observedAt: string;
  readonly outlierRatio?: number;
  readonly engagement?: number;
  readonly usageAllowed: boolean;
  readonly isDeleted: boolean;
  readonly contentReceiptId?: string;
}
export const agentSourceScopeSchema = z
  .object({ organizationId: agentSourceIdSchema, brandId: agentSourceIdSchema })
  .strict();
const selectorSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('source_post'),
      sourcePostId: agentSourceIdSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal('saved_ad'), savedAdId: agentSourceIdSchema })
    .strict(),
  z
    .object({ kind: z.literal('owned_post'), postId: agentSourceIdSchema })
    .strict(),
  z
    .object({
      kind: z.literal('trend_reference'),
      sourceReferenceId: agentSourceIdSchema,
      trendId: agentSourceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('library_video'),
      ingredientId: agentSourceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('clip_project'),
      clipProjectId: agentSourceIdSchema,
    })
    .strict(),
]);
const candidateSchema = z
  .object({
    scope: agentSourceScopeSchema,
    sourceKind: z.enum([
      'source_post',
      'saved_ad',
      'owned_post',
      'trend_reference',
      'library_video',
      'clip_project',
    ]),
    sourceId: agentSourceIdSchema,
    selector: selectorSchema,
    observedAt: agentSourceTimestampSchema,
    outlierRatio: z.number().optional(),
    engagement: z.number().optional(),
    usageAllowed: z.boolean(),
    isDeleted: z.boolean(),
    contentReceiptId: agentSourceIdSchema.optional(),
  })
  .strict();
const policyKinds: Record<AgentSourceIdentityKind, AgentSourceKind> = {
  source_post: 'imported_posts',
  saved_ad: 'saved_ads',
  owned_post: 'owned_outlier_posts',
  trend_reference: 'trends',
  library_video: 'long_form_videos',
  clip_project: 'long_form_videos',
};

export function agentSourceKey(
  candidate: Pick<AgentSourceCandidate, 'sourceKind' | 'sourceId'>,
): string {
  return JSON.stringify([candidate.sourceKind, candidate.sourceId]);
}
export function sameAgentSourceScope(
  left: AgentSourceScope,
  right: AgentSourceScope,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.brandId === right.brandId
  );
}
export function agentSourceCompatible(
  candidate: AgentSourceCandidate,
  policy: AgentSourcePolicy,
): boolean {
  if (!policy.enabledKinds.includes(policyKinds[candidate.sourceKind]))
    return false;
  return policyKinds[candidate.sourceKind] === 'long_form_videos'
    ? policy.clipsEnabled && policy.outputKinds.includes('clips')
    : policy.outputKinds.some((kind) => kind !== 'clips');
}
function selectorId(selector: AgentSourceSelector): string {
  switch (selector.kind) {
    case 'source_post':
      return selector.sourcePostId;
    case 'saved_ad':
      return selector.savedAdId;
    case 'owned_post':
      return selector.postId;
    case 'trend_reference':
      return selector.sourceReferenceId;
    case 'library_video':
      return selector.ingredientId;
    case 'clip_project':
      return selector.clipProjectId;
  }
}
function freezeCandidate(input: AgentSourceCandidate): AgentSourceCandidate {
  const candidate = candidateSchema.parse(input);
  if (
    candidate.sourceKind !== candidate.selector.kind ||
    candidate.sourceId !== selectorId(candidate.selector)
  )
    throw new Error('Mismatched source selector');
  return Object.freeze({
    ...candidate,
    scope: Object.freeze(candidate.scope),
    selector: Object.freeze(candidate.selector),
  });
}
function fingerprint(candidate: AgentSourceCandidate): string {
  return JSON.stringify(candidate); // Schema projection fixes property order for duplicate comparison.
}
function snapshot(
  candidates: readonly AgentSourceCandidate[],
): readonly AgentSourceCandidate[] {
  const unique = new Map<string, AgentSourceCandidate>();
  for (const input of candidates) {
    const candidate = freezeCandidate(input);
    const key = agentSourceKey(candidate);
    const previous = unique.get(key);
    if (previous && fingerprint(previous) !== fingerprint(candidate))
      throw new Error('Conflicting duplicate source');
    unique.set(key, candidate);
  }
  return Object.freeze([...unique.values()]);
}
export interface RankAgentSourcesInput {
  readonly scope: AgentSourceScope;
  readonly policy: AgentSourcePolicy;
  readonly now: string;
  readonly candidates: readonly AgentSourceCandidate[];
  readonly blockedSourceKeys: ReadonlySet<string>;
}
function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function descendingOptional(
  left: number | undefined,
  right: number | undefined,
): number {
  return left === undefined
    ? right === undefined
      ? 0
      : 1
    : right === undefined
      ? -1
      : right - left;
}
export function rankEligibleAgentSources(
  input: RankAgentSourcesInput,
): readonly AgentSourceCandidate[] {
  agentSourceScopeSchema.parse(input.scope);
  const policy = resolveAgentSourcePolicy(
    input.policy,
    input.policy.freshnessWindowMs,
  );
  const now = Date.parse(agentSourceTimestampSchema.parse(input.now));
  const candidates = snapshot(input.candidates);
  if (candidates.some((candidate) => Date.parse(candidate.observedAt) > now))
    throw new Error('Future source timestamp');
  return Object.freeze(
    candidates
      .filter(
        (candidate) =>
          sameAgentSourceScope(candidate.scope, input.scope) &&
          !candidate.isDeleted &&
          candidate.usageAllowed &&
          agentSourceCompatible(candidate, policy) &&
          Date.parse(candidate.observedAt) >= now - policy.freshnessWindowMs &&
          !input.blockedSourceKeys.has(agentSourceKey(candidate)),
      )
      .sort(
        (left, right) =>
          Date.parse(right.observedAt) - Date.parse(left.observedAt) ||
          descendingOptional(left.outlierRatio, right.outlierRatio) ||
          descendingOptional(left.engagement, right.engagement) ||
          lexical(left.sourceKind, right.sourceKind) ||
          lexical(left.sourceId, right.sourceId),
      ),
  );
}
export interface ValidateAgentSourceSelectionInput {
  readonly scope: AgentSourceScope;
  readonly strategyId: string;
  readonly executionId: string;
  readonly policy: AgentSourcePolicy;
  readonly candidates: readonly AgentSourceCandidate[];
  readonly selectedKeys: readonly string[];
}
export function validateAgentSourceSelection(
  input: ValidateAgentSourceSelectionInput,
): readonly AgentSourceCandidate[] {
  agentSourceScopeSchema.parse(input.scope);
  agentSourceIdSchema.parse(input.strategyId);
  agentSourceIdSchema.parse(input.executionId);
  const policy = resolveAgentSourcePolicy(
    input.policy,
    input.policy.freshnessWindowMs,
  );
  if (
    input.selectedKeys.length > policy.perRunSourceLimit ||
    new Set(input.selectedKeys).size !== input.selectedKeys.length
  )
    throw new Error('Invalid source selection count');
  const candidates = snapshot(input.candidates);
  const members = new Map(
    candidates.map((candidate) => [agentSourceKey(candidate), candidate]),
  );
  return Object.freeze(
    input.selectedKeys.map((key) => {
      const candidate = members.get(key);
      if (
        !candidate ||
        !sameAgentSourceScope(candidate.scope, input.scope) ||
        candidate.isDeleted ||
        !candidate.usageAllowed ||
        !agentSourceCompatible(candidate, policy)
      )
        throw new Error('Source outside eligible snapshot');
      return candidate;
    }),
  );
}
