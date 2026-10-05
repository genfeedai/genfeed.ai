import { LearningDatasetPublicationPins } from '@api/collections/content-learning/services/learning-dataset-publication-pins';
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
// Incoming edge with its source identity validated once at load time.
type GraphEdge = {
  // The edge row is active and names a well-formed pinned source.
  isUsable: boolean;
  // The edge names a well-formed source identity, so the source joins the closure.
  isSourceKnown: boolean;
  isGlobalSource: boolean;
  sourceKey: string;
  sourceVersion: string;
  sourceOrganizationId: string | null;
};
// NUL separators cannot appear in ids; a null (global) organization maps to SOH.
export const nodeKey = (node: DatasetNode) =>
  `${node.kind}\u0000${node.organizationId ?? '\u0001'}\u0000${node.id}`;

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
// Quoted column list for raw reads of the same rows REWARD_SELECT describes.
export const REWARD_COLUMNS = Object.keys(REWARD_SELECT)
  .map((column) => `"${column}"`)
  .join(', ');
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
    { node: DatasetNode; pin: string | null; edges: GraphEdge[] }
  >();
  private edgeCount = 0;
  private readonly validity = new Map<string, boolean>();
  private readonly heights = new Map<string, number>();
  readonly rewardFacts = new Map<string, DatasetReward>();
  get metrics() {
    return { nodes: this.nodes.size, edges: this.edgeCount };
  }
  private readonly publicationPins: LearningDatasetPublicationPins;
  // `isBulk` reads whole batches with set-based SQL for dataset extraction; the shared
  // resolver keeps the default Prisma delegate reads.
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly limits = GRAPH_LIMITS,
    private readonly isBulk = false,
  ) {
    this.publicationPins = new LearningDatasetPublicationPins(
      tx,
      DATASET_BATCH_SIZE,
      isBulk,
    );
  }
  // Pins for rows the caller just read in the same pass; consumed on first use.
  private readonly primed = new Map<string, string>();
  primeRewards(rewards: readonly DatasetReward[]) {
    for (const reward of rewards) {
      const node = {
        kind: 'reward' as const,
        id: reward.id,
        organizationId: reward.organizationId,
      };
      this.primed.set(nodeKey(node), String(reward.version));
      this.rewardFacts.set(nodeKey(node), reward);
    }
  }
  primeDecisions(
    organizationId: string,
    decisions: readonly { id: string; payloadHash: string }[],
  ) {
    for (const decision of decisions)
      if (decision.payloadHash)
        this.primed.set(
          nodeKey({ kind: 'decision', id: decision.id, organizationId }),
          decision.payloadHash,
        );
  }
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
      case 'publish_approval':
      case 'post_publish_finalization':
      case 'content_version_pin':
        return this.publicationPins.pins(kind, ids, organizationId);
      case 'account':
        return this.identityPins(kind, ids, organizationId);
      case 'checkpoint':
      case 'baseline':
      case 'decision':
      case 'reward':
        return this.isBulk
          ? this.bulkObservationPins(kind, ids, organizationId)
          : this.observationPins(kind, ids, organizationId);
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
        return this.provenancePins(kind, ids, organizationId);
      case 'consent':
        return this.consentPins(kind, ids, organizationId);
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
  private async bulkObservationPins(
    kind: 'checkpoint' | 'baseline' | 'decision' | 'reward',
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const missing: string[] = [];
    if (kind === 'reward' || kind === 'decision')
      for (const id of ids) {
        const key = nodeKey({ kind, id, organizationId });
        const pin = this.primed.get(key);
        if (pin === undefined) missing.push(id);
        else {
          this.primed.delete(key);
          result.set(id, pin);
        }
      }
    else missing.push(...ids);
    if (!missing.length) return result;
    // `= ANY(array)` binds one array per batch instead of one parameter per id.
    const rows = <T>(table: string, columns: string) =>
      this.tx.$queryRaw<T[]>(Prisma.sql`
        SELECT ${Prisma.raw(columns)} FROM ${Prisma.raw(table)}
        WHERE id = ANY(${missing}::text[]) AND "organizationId" = ${organizationId} AND NOT "isDeleted"`);
    switch (kind) {
      case 'checkpoint':
        for (const row of await rows<{ id: string; revision: number }>(
          'content_learning_checkpoints',
          'id, revision',
        ))
          result.set(row.id, String(row.revision));
        break;
      case 'baseline':
        for (const row of await rows<{ fingerprint: string; id: string }>(
          'content_learning_baselines',
          'id, fingerprint',
        ))
          if (row.fingerprint) result.set(row.id, row.fingerprint);
        break;
      case 'decision':
        for (const row of await rows<{ id: string; payloadHash: string }>(
          'content_learning_decisions',
          'id, "payloadHash"',
        ))
          if (row.payloadHash) result.set(row.id, row.payloadHash);
        break;
      case 'reward':
        for (const row of await rows<DatasetReward>(
          'content_learning_rewards',
          REWARD_COLUMNS,
        )) {
          this.rewardFacts.set(
            nodeKey({ kind, id: row.id, organizationId }),
            row,
          );
          result.set(row.id, String(row.version));
        }
        break;
    }
    return result;
  }
  private async loadBatch(part: DatasetNode[], take: number) {
    const { kind, organizationId } = part[0];
    const ids = part.map((node) => node.id);
    const pins = await this.pins(kind, ids, organizationId);
    const edges = await this.tx.$queryRaw<DatasetEdge[]>(Prisma.sql`
      SELECT "sourceKind", "sourceId", "sourceVersion", "sourceOrganizationId", "derivedId", valid
      FROM content_learning_dependencys
      WHERE "derivedKind" = ${kind} AND "derivedId" = ANY(${ids}::text[])
        AND ${organizationId === null ? Prisma.sql`"derivedOrganizationId" IS NULL` : Prisma.sql`"derivedOrganizationId" = ${organizationId}`}
        AND NOT "isDeleted"
      LIMIT ${take}`);
    return { pins, edges };
  }
  private graphEdge(edge: DatasetEdge): GraphEdge {
    const isSourceKnown =
      validLearningDependencyKind(edge.sourceKind) &&
      validLearningDependencyRef({
        kind: edge.sourceKind,
        id: edge.sourceId,
        organizationId: edge.sourceOrganizationId,
        version: edge.sourceVersion,
      });
    return {
      isUsable: edge.valid && isSourceKnown,
      isSourceKnown,
      isGlobalSource:
        isSourceKnown && isLearningGlobalDependencyKind(edge.sourceKind),
      sourceKey: `${edge.sourceKind}\u0000${edge.sourceOrganizationId ?? '\u0001'}\u0000${edge.sourceId}`,
      sourceVersion: edge.sourceVersion,
      sourceOrganizationId: edge.sourceOrganizationId,
    };
  }
  async load(roots: DatasetNode[]) {
    let frontier = new Map<string, DatasetNode>();
    for (const node of roots) frontier.set(nodeKey(node), node);
    for (let level = 0; frontier.size; level++) {
      if (level >= this.limits.levels) selectionTooLarge();
      const pending = new Map<string, DatasetNode>();
      for (const [key, node] of frontier)
        if (!this.nodes.has(key)) pending.set(key, node);
      if (!pending.size) break;
      if (this.nodes.size + pending.size > this.limits.nodes)
        selectionTooLarge();
      const groups = new Map<string, DatasetNode[]>();
      for (const node of pending.values()) {
        const key = `${node.kind}\u0000${node.organizationId ?? '\u0001'}`;
        const group = groups.get(key) ?? [];
        group.push(node);
        groups.set(key, group);
      }
      frontier = new Map();
      for (const group of groups.values())
        for (const part of batches(group)) {
          const { pins, edges } = await this.loadBatch(
            part,
            this.limits.edges - this.edgeCount + 1,
          );
          this.edgeCount += edges.length;
          if (this.edgeCount > this.limits.edges) selectionTooLarge();
          const entries = new Map<string, GraphEdge[]>();
          for (const node of part) {
            const incoming: GraphEdge[] = [];
            entries.set(node.id, incoming);
            this.nodes.set(nodeKey(node), {
              node,
              pin: pins.get(node.id) ?? null,
              edges: incoming,
            });
          }
          for (const row of edges) {
            const edge = this.graphEdge(row);
            entries.get(row.derivedId)?.push(edge);
            if (edge.isSourceKnown && !this.nodes.has(edge.sourceKey))
              frontier.set(edge.sourceKey, {
                kind: row.sourceKind as LearningDependencyKindV1,
                id: row.sourceId,
                organizationId: row.sourceOrganizationId,
              });
          }
        }
    }
  }
  valid(root: DatasetNode): boolean {
    const active = new Set<string>();
    const walk = (key: string, depth: number): boolean => {
      if (depth > this.limits.levels) selectionTooLarge();
      const cached = this.validity.get(key);
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
        (isLearningDerivedDependencyKind(value.node.kind) &&
          !value.edges.length)
      ) {
        this.validity.set(key, false);
        return false;
      }
      const { kind, organizationId } = value.node;
      const isGlobalNode = isLearningGlobalDependencyKind(kind);
      active.add(key);
      let valid = true,
        height = 1;
      for (const edge of value.edges) {
        const source = this.nodes.get(edge.sourceKey);
        if (
          !edge.isUsable ||
          (!edge.isGlobalSource &&
            !isGlobalNode &&
            edge.sourceOrganizationId !== organizationId) ||
          source?.pin !== edge.sourceVersion ||
          !walk(edge.sourceKey, depth + 1)
        ) {
          valid = false;
          break;
        }
        height = Math.max(height, 1 + (this.heights.get(edge.sourceKey) ?? 1));
      }
      active.delete(key);
      this.heights.set(key, height);
      this.validity.set(key, valid);
      return valid;
    };
    return walk(nodeKey(root), 1);
  }
  ref(node: DatasetNode): LearningDependencyRefV1 {
    const ref = { ...node, version: this.nodes.get(nodeKey(node))?.pin ?? '' };
    if (!validLearningDependencyRef(ref))
      throw new ConflictException('Pinned dependency identity unavailable');
    return ref;
  }
}
