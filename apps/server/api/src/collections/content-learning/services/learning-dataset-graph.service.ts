import {
  isLearningDerivedDependencyKind,
  isLearningGlobalDependencyKind,
  LEARNING_REGISTERED_CONFIG_VERSIONS,
  type LearningDependencyKindV1,
  type LearningDependencyRefV1,
  validLearningDependencyKind,
  validLearningDependencyRef,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

export const DATASET_BATCH_SIZE = 1000;
export const DATASET_MAX_ROWS = 100000;
const DATASET_MAX_CANDIDATES = 1000000;
export function assertLearningDatasetCandidateCount(
  count: number,
  maximum = DATASET_MAX_CANDIDATES,
) {
  if (count > maximum) selectionTooLarge();
}
const GRAPH_LIMITS = { nodes: 1000000, edges: 2000000, levels: 128 };
export function* batches<T>(values: readonly T[], size = DATASET_BATCH_SIZE) {
  for (let index = 0; index < values.length; index += size)
    yield values.slice(index, index + size);
}
export function selectionTooLarge(): never {
  throw new BadRequestException(
    'Dataset selection too large; narrow cutoff or sources',
  );
}
export type DatasetNode = Omit<LearningDependencyRefV1, 'version'>;
type DatasetEdge = Pick<
  Prisma.ContentLearningDependencyGetPayload<Record<string, never>>,
  | 'sourceKind'
  | 'sourceId'
  | 'sourceVersion'
  | 'sourceOrganizationId'
  | 'derivedId'
  | 'valid'
>;
export const nodeKey = (node: DatasetNode) =>
  JSON.stringify([node.kind, node.id, node.organizationId]);

export const REWARD_SELECT = {
  id: true,
  organizationId: true,
  credentialId: true,
  decisionId: true,
  version: true,
  composite: true,
  sourceFingerprint: true,
  createdAt: true,
  checkpointId: true,
  baselineId: true,
  status: true,
} satisfies Prisma.ContentLearningRewardSelect;
export type DatasetReward = Prisma.ContentLearningRewardGetPayload<{
  select: typeof REWARD_SELECT;
}>;
export const DECISION_SELECT = {
  id: true,
  payloadHash: true,
  createdAt: true,
  contextVector: true,
  selectedArmId: true,
  probabilities: true,
} satisfies Prisma.ContentLearningDecisionSelect;
// Dataset-local bulk resolver: keep pin semantics aligned with LearningDependencyService.
export class LearningDatasetGraph {
  private readonly nodes = new Map<
    string,
    { node: DatasetNode; pin: string | null; edges: DatasetEdge[] }
  >();
  private edgeCount = 0;
  private readonly validity = new Map<string, boolean>();
  private readonly heights = new Map<string, number>();
  readonly rewardFacts = new Map<string, DatasetReward>();
  get metrics() {
    return { nodes: this.nodes.size, edges: this.edgeCount };
  }
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly limits = GRAPH_LIMITS,
  ) {}
  async pins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string | null,
  ): Promise<Map<string, string>> {
    if (isLearningGlobalDependencyKind(kind))
      return organizationId === null ? this.globalPins(kind, ids) : new Map();
    if (!organizationId?.trim()) return new Map();
    switch (kind) {
      case 'organization':
      case 'brand':
      case 'credential':
      case 'post':
      case 'account':
        return this.identityPins(kind, ids, organizationId);
      case 'checkpoint':
      case 'baseline':
      case 'decision':
      case 'reward':
      case 'policy':
        return this.observationPins(kind, ids, organizationId);
      case 'experiment':
      case 'enrollment':
      case 'opportunity':
      case 'experiment-event':
        return this.experimentPins(kind, ids, organizationId);
      case 'provider_attempt':
      case 'llm_vendor_cost':
      case 'media_vendor_cost':
      case 'publish_approval':
      case 'content_version_pin':
        return this.provenancePins(kind, ids, organizationId);
      case 'consent':
        return this.consentPins(kind, ids, organizationId);
      case 'post_publish_finalization':
        return this.finalizationPins(kind, ids, organizationId);
      default:
        return new Map();
    }
  }
  private async globalPins(
    kind: LearningDependencyKindV1,
    ids: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const globalWhere = { id: { in: ids }, isDeleted: false };
    switch (kind) {
      case 'config':
        for (const id of ids)
          if (
            (LEARNING_REGISTERED_CONFIG_VERSIONS as readonly string[]).includes(
              id,
            )
          )
            result.set(id, id);
        break;
      case 'dataset': {
        const rows = await this.tx.contentLearningDataset.findMany({
          select: { id: true, manifestHash: true },
          where: { ...globalWhere, status: { not: 'invalidated' } },
        });
        for (const row of rows) {
          const pin = row.manifestHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'run': {
        const rows = await this.tx.contentLearningRun.findMany({
          select: { configHash: true, id: true },
          where: { ...globalWhere, status: { not: 'invalidated' } },
        });
        for (const row of rows) {
          const pin = row.configHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'shared-policy': {
        const rows = await this.tx.contentLearningSharedPolicy.findMany({
          select: { id: true, version: true },
          where: { ...globalWhere, validity: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.version);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'release': {
        const rows = await this.tx.contentLearningRelease.findMany({
          select: { id: true, revision: true },
          where: { ...globalWhere, stage: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.revision);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
    }
    return result;
  }
  private async identityPins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const globalWhere = { id: { in: ids }, isDeleted: false };
    const tenantWhere = { ...globalWhere, organizationId };
    switch (kind) {
      case 'organization': {
        const rows = await this.tx.organization.findMany({
          select: { id: true },
          where: { id: { in: ids }, isDeleted: false },
        });
        for (const row of rows) {
          const pin = row.id === organizationId ? row.id : null;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'brand': {
        const rows = await this.tx.brand.findMany({
          select: { id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'credential': {
        const rows = await this.tx.credential.findMany({
          select: { id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'post': {
        const rows = await this.tx.post.findMany({
          select: { id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'account': {
        const rows = await this.tx.contentLearningAccount.findMany({
          select: { epoch: true, id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = String(row.epoch);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
    }
    return result;
  }
  private async observationPins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const globalWhere = { id: { in: ids }, isDeleted: false };
    const tenantWhere = { ...globalWhere, organizationId };
    switch (kind) {
      case 'checkpoint': {
        const rows = await this.tx.contentLearningCheckpoint.findMany({
          select: { id: true, revision: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = String(row.revision);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'baseline': {
        const rows = await this.tx.contentLearningBaseline.findMany({
          select: { fingerprint: true, id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.fingerprint;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'decision': {
        const rows = await this.tx.contentLearningDecision.findMany({
          select: { id: true, payloadHash: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.payloadHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'reward': {
        const rows = await this.tx.contentLearningReward.findMany({
          select: REWARD_SELECT,
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          this.rewardFacts.set(
            nodeKey({ kind, id: row.id, organizationId }),
            row,
          );
          const pin = String(row.version);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'policy': {
        const rows = await this.tx.contentLearningPolicyVersion.findMany({
          select: { id: true, version: true },
          where: { ...tenantWhere, state: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.version);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
    }
    return result;
  }
  private async experimentPins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const globalWhere = { id: { in: ids }, isDeleted: false };
    const tenantWhere = { ...globalWhere, organizationId };
    switch (kind) {
      case 'experiment': {
        const rows = await this.tx.contentLearningExperiment.findMany({
          select: { id: true, specHash: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.specHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'enrollment': {
        const rows = await this.tx.contentLearningEnrollment.findMany({
          select: { accountEpoch: true, consentNoticeVersion: true, id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = `${row.accountEpoch}:${row.consentNoticeVersion}`;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'opportunity': {
        const rows = await this.tx.contentLearningOpportunity.findMany({
          select: { id: true, specHash: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.specHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'experiment-event': {
        const rows = await this.tx.contentLearningExperimentEvent.findMany({
          select: { fingerprint: true, id: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.fingerprint;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
    }
    return result;
  }
  private async provenancePins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const tenantWhere = { id: { in: ids }, isDeleted: false, organizationId };
    switch (kind) {
      case 'provider_attempt': {
        // DISTINCT ON bounds event history and preserves the first ID pin.
        const rows = await this.tx.$queryRaw<
          Array<{ sourceId: string; sourceRevision: string }>
        >(Prisma.sql`
          SELECT DISTINCT ON ("sourceId") "sourceId", "sourceRevision" FROM content_learning_experiment_events
          WHERE "sourceKind" = 'provider_attempt' AND "sourceId" IN (${Prisma.join(ids)})
          AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY "sourceId", id ASC`);
        for (const row of rows) result.set(row.sourceId, row.sourceRevision);
        break;
      }
      case 'llm_vendor_cost': {
        const rows = await this.tx.llmVendorCost.findMany({
          select: { id: true, learningAttemptId: true, updatedAt: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.learningAttemptId
            ? `${row.learningAttemptId}:${row.id}:${row.updatedAt.toISOString()}`
            : null;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'media_vendor_cost': {
        const rows = await this.tx.mediaVendorCost.findMany({
          select: { id: true, learningAttemptId: true, updatedAt: true },
          where: { ...tenantWhere },
        });
        for (const row of rows) {
          const pin = row.learningAttemptId
            ? `${row.learningAttemptId}:${row.id}:${row.updatedAt.toISOString()}`
            : null;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'publish_approval': {
        const rows = await this.tx.publishApproval.findMany({
          select: { artifactVersionPinId: true, id: true },
          where: {
            id: { in: ids },
            organizationId: organizationId ?? undefined,
            status: 'approved',
            invalidatedAt: null,
          },
        });
        for (const row of rows) {
          const pin = row.artifactVersionPinId;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'content_version_pin': {
        const rows = await this.tx.contentVersionPin.findMany({
          select: { contentDigest: true, id: true },
          where: {
            id: { in: ids },
            organizationId: organizationId ?? undefined,
          },
        });
        for (const row of rows) {
          const pin = row.contentDigest;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
    }
    return result;
  }
  private async consentPins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const globalWhere = { id: { in: ids }, isDeleted: false };
    const tenantWhere = { ...globalWhere, organizationId };
    switch (kind) {
      case 'consent': {
        const rows = await this.tx.contentLearningConsent.findMany({
          select: { id: true, accountId: true, version: true },
          where: { ...tenantWhere, granted: true, revokedAt: null },
        });
        const accounts = new Map<string, number | null>();
        for (const ids of batches([
          ...new Set(rows.map((row) => row.accountId)),
        ])) {
          const values = await this.tx.contentLearningAccount.findMany({
            select: { id: true, sharingConsentVersion: true },
            where: {
              id: { in: ids },
              organizationId: organizationId ?? undefined,
              isDeleted: false,
            },
          });
          for (const account of values)
            accounts.set(account.id, account.sharingConsentVersion);
        }
        for (const row of rows)
          if (accounts.get(row.accountId) === row.version)
            result.set(row.id, String(row.version));
        break;
      }
    }
    return result;
  }
  private async finalizationPins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    switch (kind) {
      case 'post_publish_finalization': {
        const rows = await this.tx.postPublishFinalization.findMany({
          select: { id: true, postId: true, completedAt: true, source: true },
          where: {
            id: { in: ids },
            organizationId: organizationId ?? undefined,
          },
        });
        const posts = new Set<string>();
        for (const ids of batches([
          ...new Set(rows.map((row) => row.postId)),
        ])) {
          const values = await this.tx.post.findMany({
            select: { id: true },
            where: {
              id: { in: ids },
              organizationId: organizationId ?? undefined,
              isDeleted: false,
            },
          });
          for (const post of values) posts.add(post.id);
        }
        for (const row of rows)
          if (posts.has(row.postId))
            result.set(row.id, row.completedAt?.toISOString() ?? row.source);
        break;
      }
    }
    return result;
  }
  async load(roots: DatasetNode[]) {
    let frontier = roots;
    for (let level = 0; frontier.length; level++) {
      if (level >= this.limits.levels) selectionTooLarge();
      const pending = new Map<string, DatasetNode>();
      for (const node of frontier)
        if (!this.nodes.has(nodeKey(node))) pending.set(nodeKey(node), node);
      if (!pending.size) break;
      if (this.nodes.size + pending.size > this.limits.nodes)
        selectionTooLarge();
      const groups = new Map<string, DatasetNode[]>();
      for (const node of pending.values()) {
        const key = JSON.stringify([node.kind, node.organizationId]);
        const group = groups.get(key) ?? [];
        group.push(node);
        groups.set(key, group);
      }
      frontier = [];
      for (const group of groups.values())
        for (const part of batches(group)) {
          const { kind, organizationId } = part[0];
          const pins = await this.pins(
            kind,
            part.map((node) => node.id),
            organizationId,
          );
          const edges = await this.tx.contentLearningDependency.findMany({
            select: {
              sourceKind: true,
              sourceId: true,
              sourceVersion: true,
              sourceOrganizationId: true,
              derivedId: true,
              valid: true,
            },
            where: {
              derivedKind: kind,
              derivedId: { in: part.map((node) => node.id) },
              derivedOrganizationId: organizationId,
              isDeleted: false,
            },
            take: this.limits.edges - this.edgeCount + 1,
          });
          this.edgeCount += edges.length;
          if (this.edgeCount > this.limits.edges) selectionTooLarge();
          for (const node of part)
            this.nodes.set(nodeKey(node), {
              node,
              pin: pins.get(node.id) ?? null,
              edges: [],
            });
          for (const edge of edges) {
            this.nodes
              .get(nodeKey({ kind, id: edge.derivedId, organizationId }))
              ?.edges.push(edge);
            if (
              validLearningDependencyKind(edge.sourceKind) &&
              validLearningDependencyRef({
                kind: edge.sourceKind,
                id: edge.sourceId,
                organizationId: edge.sourceOrganizationId,
                version: edge.sourceVersion,
              })
            )
              frontier.push({
                kind: edge.sourceKind,
                id: edge.sourceId,
                organizationId: edge.sourceOrganizationId,
              });
          }
        }
    }
  }
  valid(root: DatasetNode): boolean {
    const active = new Set<string>();
    const walk = (node: DatasetNode, depth = 1): boolean => {
      if (depth > this.limits.levels) selectionTooLarge();
      const key = nodeKey(node),
        cached = this.validity.get(key);
      if (cached !== undefined) {
        if (
          cached &&
          depth - 1 + (this.heights.get(key) ?? 1) > this.limits.levels
        )
          selectionTooLarge();
        return cached;
      }
      if (active.has(key)) return false;
      const value = this.nodes.get(key);
      if (
        !value?.pin ||
        (isLearningDerivedDependencyKind(node.kind) && !value.edges.length)
      ) {
        this.validity.set(key, false);
        return false;
      }
      active.add(key);
      let valid = true,
        height = 1;
      for (const edge of value.edges) {
        if (
          !edge.valid ||
          !validLearningDependencyKind(edge.sourceKind) ||
          !validLearningDependencyRef({
            kind: edge.sourceKind,
            id: edge.sourceId,
            organizationId: edge.sourceOrganizationId,
            version: edge.sourceVersion,
          })
        ) {
          valid = false;
          break;
        }
        const source = {
          kind: edge.sourceKind,
          id: edge.sourceId,
          organizationId: edge.sourceOrganizationId,
        };
        if (
          (!isLearningGlobalDependencyKind(source.kind) &&
            !isLearningGlobalDependencyKind(node.kind) &&
            source.organizationId !== node.organizationId) ||
          this.nodes.get(nodeKey(source))?.pin !== edge.sourceVersion ||
          !walk(source, depth + 1)
        ) {
          valid = false;
          break;
        }
        height = Math.max(height, 1 + (this.heights.get(nodeKey(source)) ?? 1));
      }
      active.delete(key);
      this.heights.set(key, height);
      this.validity.set(key, valid);
      return valid;
    };
    return walk(root);
  }
  ref(node: DatasetNode): LearningDependencyRefV1 {
    const ref = { ...node, version: this.nodes.get(nodeKey(node))?.pin ?? '' };
    if (!validLearningDependencyRef(ref))
      throw new ConflictException('Pinned dependency identity unavailable');
    return ref;
  }
}
