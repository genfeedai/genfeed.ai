import type { AnalyticsCollectionAuthorization } from '@api/analytics/analytics-collection-action.types';
import type {
  BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import {
  type HiddenExecutionRef,
  type HiddenWorkflowRule,
  hiddenExecutionRef,
  validateHiddenExecutionChain,
} from '@api/authorization/brand-access/hidden-execution-chain.util';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  toWorkflowActor,
  type WorkflowInitiatingActor,
  workflowActorKey,
} from '@api/authorization/brand-access/workflow-actor.util';
import { ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID } from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';

/** Key of the persisted authenticated actor on a hidden analytics root's input and its discovered items. */
export const ANALYTICS_ACTOR_KEY = 'initiatingActor';

export const ANALYTICS_ORGANIZATION_REFRESH_WORKFLOW_ID =
  'analytics.organization-refresh';
export const ANALYTICS_POST_REFRESH_WORKFLOW_PREFIX = 'analytics.post-refresh.';
export const ANALYTICS_ORGANIZATION_REFRESH_SOURCE = 'analytics-api-refresh';
export const ANALYTICS_POST_REFRESH_SOURCE = 'post-analytics-api-refresh';

export type AnalyticsActorDeps = {
  policy: BrandAccessService;
  prisma: Prisma.TransactionClient;
};

export function denyAnalyticsCollectionActor(): never {
  throw new ForbiddenException('analytics_collection_actor_denied');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const ORGANIZATION_REFRESH_RULE: HiddenWorkflowRule = {
  matches: (canonicalId) =>
    canonicalId === ANALYTICS_ORGANIZATION_REFRESH_WORKFLOW_ID,
  rootSources: [ANALYTICS_ORGANIZATION_REFRESH_SOURCE],
};

const POST_REFRESH_RULE: HiddenWorkflowRule = {
  matches: (canonicalId) =>
    canonicalId.startsWith(ANALYTICS_POST_REFRESH_WORKFLOW_PREFIX),
  rootSources: [ANALYTICS_POST_REFRESH_SOURCE],
};

/** The hidden roots whose discovery step may stamp their authenticated actor onto items. */
const COLLECTION_ROOT_RULE: HiddenWorkflowRule = {
  matches: (canonicalId) =>
    ORGANIZATION_REFRESH_RULE.matches(canonicalId) ||
    POST_REFRESH_RULE.matches(canonicalId),
  rootSources: [
    ANALYTICS_ORGANIZATION_REFRESH_SOURCE,
    ANALYTICS_POST_REFRESH_SOURCE,
  ],
};

const COLLECTION_ITEM_WORKFLOW_IDS: ReadonlySet<string> = new Set(
  Object.values(ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS),
);

/** A per-platform collection child, only ever fanned out from an actor-bound refresh parent. */
const COLLECTION_ITEM_RULE: HiddenWorkflowRule = {
  holderKey: 'item',
  matches: (canonicalId) => COLLECTION_ITEM_WORKFLOW_IDS.has(canonicalId),
  parents: [
    {
      nodeId: (nodeId) => nodeId.startsWith('collect-each-'),
      rule: ORGANIZATION_REFRESH_RULE,
    },
    {
      nodeId: (nodeId) => nodeId === 'collect-post',
      rule: POST_REFRESH_RULE,
    },
  ],
};

/** The daily account child, whose actor is its scheduled parent's server-written binding. */
const DAILY_ACCOUNT_RULE: HiddenWorkflowRule = {
  holderKey: 'item',
  matches: (canonicalId) =>
    canonicalId === DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
  parents: [{ kind: 'scheduled-tenant' }],
};

/** The persisted form of an authenticated actor for a hidden analytics root. */
export function analyticsRootActor(
  actor: BrandAccessActor,
  organizationId: string,
): WorkflowInitiatingActor {
  const persisted = toWorkflowActor(actor, denyAnalyticsCollectionActor);
  if (persisted.organizationId !== organizationId)
    return denyAnalyticsCollectionActor();
  return persisted;
}

export function analyticsRootActorKey(actor: BrandAccessActor): string {
  return workflowActorKey(actor, denyAnalyticsCollectionActor);
}

async function authorize(
  deps: AnalyticsActorDeps,
  value: unknown,
  organizationId: string,
): Promise<AnalyticsCollectionAuthorization> {
  const refresh = () =>
    refreshWorkflowActor(
      deps.prisma,
      deps.policy,
      value,
      organizationId,
      denyAnalyticsCollectionActor,
    );
  const initiatingActor = await refresh();
  if (!initiatingActor) return denyAnalyticsCollectionActor();
  return {
    initiatingActor,
    admit: async (brandId?: string) => {
      const actor = await refresh();
      if (brandId === undefined) return;
      if (!actor) return denyAnalyticsCollectionActor();
      await deps.policy.assert(actor, brandId, deps.prisma);
    },
  };
}

/**
 * Discovery step of a hidden analytics refresh root: the actor its server-persisted input
 * carries, validated against the pinned hidden root. Roots without an actor (platform
 * sweeps, actor-less queues) yield none and collection runs as it always has.
 */
export async function resolveAnalyticsRootActor(
  deps: AnalyticsActorDeps,
  context: Parameters<typeof hiddenExecutionRef>[0],
): Promise<WorkflowInitiatingActor | undefined> {
  const ref = hiddenExecutionRef(
    context,
    undefined,
    denyAnalyticsCollectionActor,
  );
  const { actor } = await validateHiddenExecutionChain(
    deps.prisma,
    ref,
    COLLECTION_ROOT_RULE,
    { deny: denyAnalyticsCollectionActor, skipWhenUnbound: true },
  );
  return actor === undefined
    ? undefined
    : parseWorkflowActor(
        actor,
        ref.organizationId,
        denyAnalyticsCollectionActor,
      );
}

/**
 * Collection step of a per-platform child workflow. The supplied item's actor is only a hint
 * that one was stamped: authority comes from the persisted child record and its validated
 * parent chain, so a forged or stale item can only deny, never grant.
 */
export async function resolveAnalyticsCollectionAuthorization(
  deps: AnalyticsActorDeps,
  context: Parameters<typeof hiddenExecutionRef>[0],
  suppliedItem: unknown,
): Promise<AnalyticsCollectionAuthorization | undefined> {
  if (record(suppliedItem)[ANALYTICS_ACTOR_KEY] === undefined) return undefined;
  const ref = hiddenExecutionRef(
    context,
    undefined,
    denyAnalyticsCollectionActor,
  );
  const { actor } = await validateHiddenExecutionChain(
    deps.prisma,
    ref,
    COLLECTION_ITEM_RULE,
    { deny: denyAnalyticsCollectionActor },
  );
  return authorize(deps, actor, ref.organizationId);
}

/**
 * Daily-publishing account step: the configuring principal of the scheduled parent workflow,
 * when the parent was started by its schedule. Manual runs yield no authorization.
 */
export async function resolveDailyPublishingAuthorization(
  deps: AnalyticsActorDeps,
  context: Parameters<typeof hiddenExecutionRef>[0],
  provenance: Parameters<typeof hiddenExecutionRef>[1],
): Promise<AnalyticsCollectionAuthorization | undefined> {
  const ref: HiddenExecutionRef = hiddenExecutionRef(
    context,
    provenance,
    denyAnalyticsCollectionActor,
  );
  const { actor } = await validateHiddenExecutionChain(
    deps.prisma,
    ref,
    DAILY_ACCOUNT_RULE,
    { deny: denyAnalyticsCollectionActor },
  );
  return actor === undefined
    ? undefined
    : authorize(deps, actor, ref.organizationId);
}
