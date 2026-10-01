import { createHmac, randomBytes } from 'node:crypto';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  isLearningDerivedDependencyKind,
  isLearningGlobalDependencyKind,
  LEARNING_REGISTERED_CONFIG_VERSIONS,
  type LearningDatasetSourceAccount,
  type LearningDependencyKindV1,
  type LearningDependencyRefV1,
  type LearningNumericRow,
  validLearningDependencyKind,
  validLearningDependencyRef,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { assertLearningFeatures, LEARNING_ARMS } from '@genfeedai/harness';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const DATASET_BATCH_SIZE = 1000;
const DATASET_MAX_ROWS = 100000;
const DATASET_MAX_CANDIDATES = 1000000;
const GRAPH_LIMITS = { nodes: 1000000, edges: 2000000, levels: 128 };
function* batches<T>(values: readonly T[], size = DATASET_BATCH_SIZE) {
  for (let index = 0; index < values.length; index += size)
    yield values.slice(index, index + size);
}
function selectionTooLarge(): never {
  throw new BadRequestException(
    'Dataset selection too large; narrow cutoff or sources',
  );
}
type DatasetNode = Omit<LearningDependencyRefV1, 'version'>;
type DatasetEdge = Prisma.ContentLearningDependencyGetPayload<
  Record<string, never>
>;
const nodeKey = (node: DatasetNode) =>
  JSON.stringify([node.kind, node.id, node.organizationId]);

// Dataset-local bulk resolver: keep pin semantics aligned with LearningDependencyService.
export class LearningDatasetGraph {
  private readonly nodes = new Map<
    string,
    { node: DatasetNode; pin: string | null; edges: DatasetEdge[] }
  >();
  private edgeCount = 0;
  private readonly validity = new Map<string, boolean>();
  readonly rewardFacts = new Map<
    string,
    Prisma.ContentLearningRewardGetPayload<Record<string, never>>
  >();
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly limits = GRAPH_LIMITS,
  ) {}
  async pins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string | null,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (
      isLearningGlobalDependencyKind(kind)
        ? organizationId !== null
        : !organizationId?.trim()
    )
      return result;
    const where = {
      id: { in: ids },
      ...(organizationId === null ? {} : { organizationId }),
      isDeleted: false,
    };
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
      case 'organization': {
        const rows = await this.tx.organization.findMany({
          where: { id: { in: ids }, isDeleted: false },
        });
        for (const row of rows) {
          const pin = row.id === organizationId ? row.id : null;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'brand': {
        const rows = await this.tx.brand.findMany({ where: { ...where } });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'credential': {
        const rows = await this.tx.credential.findMany({ where: { ...where } });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'post': {
        const rows = await this.tx.post.findMany({ where: { ...where } });
        for (const row of rows) {
          const pin = row.id;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'account': {
        const rows = await this.tx.contentLearningAccount.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = String(row.epoch);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'checkpoint': {
        const rows = await this.tx.contentLearningCheckpoint.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = String(row.revision);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'baseline': {
        const rows = await this.tx.contentLearningBaseline.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = row.fingerprint;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'decision': {
        const rows = await this.tx.contentLearningDecision.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = row.payloadHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'reward': {
        const rows = await this.tx.contentLearningReward.findMany({
          where: { ...where },
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
          where: { ...where, state: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.version);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'dataset': {
        const rows = await this.tx.contentLearningDataset.findMany({
          where: { ...where, status: { not: 'invalidated' } },
        });
        for (const row of rows) {
          const pin = row.manifestHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'run': {
        const rows = await this.tx.contentLearningRun.findMany({
          where: { ...where, status: { not: 'invalidated' } },
        });
        for (const row of rows) {
          const pin = row.configHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'shared-policy': {
        const rows = await this.tx.contentLearningSharedPolicy.findMany({
          where: { ...where, validity: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.version);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'release': {
        const rows = await this.tx.contentLearningRelease.findMany({
          where: { ...where, stage: { not: 'invalid' } },
        });
        for (const row of rows) {
          const pin = String(row.revision);
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'experiment': {
        const rows = await this.tx.contentLearningExperiment.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = row.specHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'enrollment': {
        const rows = await this.tx.contentLearningEnrollment.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = `${row.accountEpoch}:${row.consentNoticeVersion}`;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'opportunity': {
        const rows = await this.tx.contentLearningOpportunity.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = row.specHash;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'experiment-event': {
        const rows = await this.tx.contentLearningExperimentEvent.findMany({
          where: { ...where },
        });
        for (const row of rows) {
          const pin = row.fingerprint;
          if (pin) result.set(row.id, pin);
        }
        break;
      }
      case 'llm_vendor_cost': {
        const rows = await this.tx.llmVendorCost.findMany({
          where: { ...where },
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
          where: { ...where },
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

      case 'consent': {
        const rows = await this.tx.contentLearningConsent.findMany({
          where: { ...where, granted: true, revokedAt: null },
        });
        const accounts = new Map<string, number | null>();
        for (const ids of batches([
          ...new Set(rows.map((row) => row.accountId)),
        ])) {
          const values = await this.tx.contentLearningAccount.findMany({
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
      case 'post_publish_finalization': {
        const rows = await this.tx.postPublishFinalization.findMany({
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
    const walk = (node: DatasetNode): boolean => {
      const key = nodeKey(node),
        cached = this.validity.get(key);
      if (cached !== undefined) return cached;
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
      let valid = true;
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
          !walk(source)
        ) {
          valid = false;
          break;
        }
      }
      active.delete(key);
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

const ROW_KEYS = [
  'sourceFingerprint',
  'accountGroup',
  'decisionAt',
  'measuredAt',
  'features',
  'armId',
  'probabilities',
  'reward',
  'synthetic',
];
export function validateLearningRows(
  input: unknown,
  cutoff: Date,
): LearningNumericRow[] {
  if (!Array.isArray(input) || input.length > 100000)
    throw new BadRequestException(
      'Dataset must contain at most 100,000 observed decisions',
    );
  return input.map((value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !ROW_KEYS.includes(key))
    )
      throw new BadRequestException('Unknown dataset fields are forbidden');
    const {
      sourceFingerprint,
      accountGroup,
      decisionAt,
      measuredAt,
      features,
      armId,
      probabilities,
      reward,
      synthetic,
    } = value;
    if (
      typeof sourceFingerprint !== 'string' ||
      sourceFingerprint.length > 256 ||
      !sourceFingerprint ||
      typeof accountGroup !== 'string' ||
      accountGroup.length > 256 ||
      !accountGroup ||
      typeof decisionAt !== 'string' ||
      typeof measuredAt !== 'string' ||
      typeof armId !== 'string' ||
      !LEARNING_ARMS.includes(armId as (typeof LEARNING_ARMS)[number]) ||
      !Array.isArray(features) ||
      features.some((v) => typeof v !== 'number') ||
      typeof reward !== 'number' ||
      !Number.isFinite(reward) ||
      Math.abs(reward) > 1 ||
      typeof synthetic !== 'boolean'
    )
      throw new BadRequestException('Invalid observed-bandit numeric row');
    try {
      assertLearningFeatures(features);
    } catch {
      throw new BadRequestException('Invalid nine-feature vector');
    }
    if (
      !probabilities ||
      typeof probabilities !== 'object' ||
      Array.isArray(probabilities) ||
      Object.keys(probabilities).length !== 3 ||
      Object.keys(probabilities).some(
        (key) => !LEARNING_ARMS.includes(key as (typeof LEARNING_ARMS)[number]),
      )
    )
      throw new BadRequestException('Complete logging distribution required');
    const distribution: Record<string, number> = {};
    for (const arm of LEARNING_ARMS) {
      const p = probabilities[arm];
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)
        throw new BadRequestException('Invalid logging probability');
      distribution[arm] = p;
    }
    if (
      Math.abs(Object.values(distribution).reduce((a, b) => a + b, 0) - 1) >
        1e-9 ||
      distribution[armId] <= 0
    )
      throw new BadRequestException('Invalid logging distribution');
    const decision = new Date(decisionAt),
      measured = new Date(measuredAt);
    if (
      !Number.isFinite(decision.getTime()) ||
      !Number.isFinite(measured.getTime()) ||
      measured < decision ||
      measured > cutoff
    )
      throw new BadRequestException('Outcomes must mature before cutoff');
    return {
      sourceFingerprint,
      accountGroup,
      decisionAt,
      measuredAt,
      features,
      armId,
      probabilities: distribution,
      reward,
      synthetic,
    };
  });
}
export interface LearningDatasetCreationInput {
  organizationId: string;
  requestId: string;

  actorId: string;
  rightsStatement: string;
  profile: string;
  cell: string;
  cutoff: string;
  rows?: unknown;
  sourceAccounts?: LearningDatasetSourceAccount[];
}
@Injectable()
export class LearningDatasetService {
  constructor(
    private readonly prisma: PrismaService,
    _dependencies: LearningDependencyService,
  ) {}
  async create(input: LearningDatasetCreationInput) {
    const scope = learningHash(['dataset-create', input.organizationId]);
    const payloadHash = learningHash(['dataset-create', input]);
    return this.prisma.$transaction(
      async (tx) => {
        await learningFence(tx, 'shared');
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${learningHash([input.actorId, scope, input.requestId])}, 0))::text`;
        const previous = await tx.contentLearningOperation.findFirst({
          where: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope,
            requestId: input.requestId,
            isDeleted: false,
          },
        });
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            throw new ConflictException('Request key payload conflict');
          const refs = previous.resultReferences;
          if (
            !refs ||
            typeof refs !== 'object' ||
            Array.isArray(refs) ||
            typeof refs.datasetId !== 'string'
          )
            throw new ConflictException(
              'Dataset operation receipt unavailable',
            );
          const original = await tx.contentLearningDataset.findFirst({
            where: {
              id: refs.datasetId,
              ownerActorId: input.actorId,
              isDeleted: false,
            },
          });
          if (!original)
            throw new ConflictException('Dataset no longer available');
          return original;
        }
        const dataset = await this.buildSnapshot(input, tx);
        await tx.contentLearningOperation.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope,
            requestId: input.requestId,
            payloadHash,
            type: 'dataset-create',
            status: 'completed',
            resultReferences: toPrismaJson({
              datasetId: dataset.id,
              manifestHash: dataset.manifestHash,
            }),
          },
        });
        return dataset;
      },
      { maxWait: 5000, timeout: 90000 },
    );
  }
  private async source(
    tx: Prisma.TransactionClient,
    source: LearningDatasetSourceAccount,
  ) {
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        id: source.accountId,
        organizationId: source.organizationId,
        isDeleted: false,
      },
    });
    if (!account) throw new NotFoundException('Source account');
    if (!account.sharingConsentVersion)
      throw new BadRequestException(
        'Current owner contribution consent required',
      );
    const consent = await tx.contentLearningConsent.findFirst({
      where: {
        organizationId: account.organizationId,
        accountId: account.id,
        version: account.sharingConsentVersion,
        granted: true,
        revokedAt: null,
        isDeleted: false,
      },
    });
    if (!consent) throw new BadRequestException('Consent withdrawn');
    return { account, consent };
  }
  private async latest(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ids: string[],
  ) {
    const rows = await tx.contentLearningReward.groupBy({
      by: ['decisionId'],
      where: { organizationId, decisionId: { in: ids }, isDeleted: false },
      _max: { version: true },
    });
    return new Map(rows.map((row) => [row.decisionId, row._max.version]));
  }
  private async buildSnapshot(
    input: LearningDatasetCreationInput,
    tx: Prisma.TransactionClient,
  ) {
    if (input.rightsStatement.length < 1 || input.rightsStatement.length > 2000)
      throw new BadRequestException(
        'Explicit owned rights attestation required',
      );
    const cutoff = new Date(input.cutoff);
    if (!Number.isFinite(cutoff.getTime()) || cutoff > new Date())
      throw new BadRequestException('Invalid immutable cutoff');
    let rows: LearningNumericRow[] = [];
    const provenance = new Map<
      string,
      {
        fingerprint: string;
        rewardId: string;
        rewardVersion: number;
        decisionId: string;
        decisionPayloadHash: string;
        rowHash: string;
        consentId: string;
        consentVersion: number;
        accountId: string;
        credentialId: string;
        organizationId: string;
      }
    >();
    if (input.rows) rows = validateLearningRows(input.rows, cutoff);
    const sources = input.sourceAccounts ?? [];
    if (sources.length > 100)
      throw new BadRequestException('At most 100 source accounts supported');
    const seenAccounts = new Set<string>();
    for (const source of sources) {
      if (
        !source ||
        typeof source.organizationId !== 'string' ||
        typeof source.accountId !== 'string' ||
        !source.organizationId.trim() ||
        !source.accountId.trim()
      )
        throw new BadRequestException('Source account identity required');
      if (seenAccounts.has(source.accountId))
        throw new BadRequestException('Duplicate source account');
      seenAccounts.add(source.accountId);
    }
    const graph = new LearningDatasetGraph(tx);
    let examined = 0;
    for (const source of sources) {
      const { account, consent } = await this.source(tx, source);
      let cursor: string | undefined;
      for (;;) {
        const rewards = await tx.contentLearningReward.findMany({
          where: {
            organizationId: account.organizationId,
            credentialId: account.credentialId,
            status: 'valid',
            isDeleted: false,
            createdAt: { lte: cutoff },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: 'asc' },
          take: DATASET_BATCH_SIZE,
        });
        if (!rewards.length) break;
        cursor = rewards[rewards.length - 1].id;
        examined += rewards.length;
        if (examined > DATASET_MAX_CANDIDATES) selectionTooLarge();
        const decisionIds = [
          ...new Set(rewards.map((reward) => reward.decisionId)),
        ];
        const latest = await this.latest(
          tx,
          account.organizationId,
          decisionIds,
        );
        const decisions = new Map(
          (
            await tx.contentLearningDecision.findMany({
              where: {
                id: { in: decisionIds },
                organizationId: account.organizationId,
                credentialId: account.credentialId,
                isDeleted: false,
                synthetic: false,
                state: 'published',
                createdAt: { lte: cutoff, gte: consent.grantedAt ?? cutoff },
              },
            })
          ).map((decision) => [decision.id, decision]),
        );
        const eligible = rewards.filter(
          (reward) =>
            reward.composite !== null &&
            latest.get(reward.decisionId) === reward.version &&
            decisions.has(reward.decisionId),
        );
        await graph.load(
          eligible.map((reward) => ({
            kind: 'reward',
            id: reward.id,
            organizationId: account.organizationId,
          })),
        );
        for (const reward of eligible) {
          if (
            !graph.valid({
              kind: 'reward',
              id: reward.id,
              organizationId: account.organizationId,
            })
          )
            continue;
          const decision = decisions.get(reward.decisionId);
          if (!decision || !consent.grantedAt) continue;
          const row = validateLearningRows(
            [
              {
                sourceFingerprint: reward.sourceFingerprint,
                accountGroup: account.id,
                decisionAt: decision.createdAt.toISOString(),
                measuredAt: reward.createdAt.toISOString(),
                features: decision.contextVector,
                armId: decision.selectedArmId,
                probabilities: decision.probabilities,
                reward: reward.composite,
                synthetic: false,
              },
            ],
            cutoff,
          )[0];
          if (provenance.has(row.sourceFingerprint))
            throw new BadRequestException('Duplicate source fingerprint');
          rows.push(row);
          provenance.set(row.sourceFingerprint, {
            fingerprint: row.sourceFingerprint,
            rewardId: reward.id,
            rewardVersion: reward.version,
            decisionId: reward.decisionId,
            decisionPayloadHash: decision.payloadHash,
            rowHash: learningHash(row),
            consentId: consent.id,
            consentVersion: consent.version,
            accountId: account.id,
            credentialId: account.credentialId,
            organizationId: account.organizationId,
          });
          if (rows.length > DATASET_MAX_ROWS) selectionTooLarge();
        }
      }
    }
    if (rows.length > 100000)
      throw new BadRequestException(
        `Selection contains ${rows.length} rewards; maximum is 100000. Narrow cutoff or sources.`,
      );
    if (new Set(rows.map((row) => row.sourceFingerprint)).size !== rows.length)
      throw new BadRequestException('Duplicate source fingerprint');
    const salt = randomBytes(32).toString('hex'),
      group = (id: string) =>
        createHmac('sha256', salt).update(id).digest('hex');
    rows = rows
      .map((row) => ({ ...row, accountGroup: group(row.accountGroup) }))
      .sort(
        (a, b) =>
          a.accountGroup.localeCompare(b.accountGroup) ||
          a.decisionAt.localeCompare(b.decisionAt) ||
          a.sourceFingerprint.localeCompare(b.sourceFingerprint),
      );
    const groups = [...new Set(rows.map((row) => row.accountGroup))].sort(
      (a, b) => learningHash(a).localeCompare(learningHash(b)),
    );
    const holdout = new Set(
      groups.slice(0, Math.max(1, Math.ceil(groups.length * 0.2))),
    );
    const accountRowsByGroup = new Map<string, LearningNumericRow[]>();
    for (const row of rows) {
      const values = accountRowsByGroup.get(row.accountGroup) ?? [];
      values.push(row);
      accountRowsByGroup.set(row.accountGroup, values);
    }
    const temporal = new Set<string>();
    for (const account of groups.filter((id) => !holdout.has(id))) {
      const accountRows = accountRowsByGroup.get(account) ?? [];
      for (const row of accountRows.slice(Math.floor(accountRows.length * 0.8)))
        temporal.add(row.sourceFingerprint);
    }
    const split = (row: LearningNumericRow) =>
      holdout.has(row.accountGroup)
        ? 'account_holdout'
        : temporal.has(row.sourceFingerprint)
          ? 'temporal_holdout'
          : 'training';
    const synthetic = rows.some((row) => row.synthetic),
      manifestHash = learningHash([
        input.cell,
        input.profile,
        cutoff.toISOString(),
        rows.map((row) => [row, split(row)]),
      ]);

    // Lock decisions before the fresh pass: reward inserts take FK key-share locks.
    const selectedByOrg = new Map<string, Set<string>>();
    for (const source of provenance.values()) {
      const ids = selectedByOrg.get(source.organizationId) ?? new Set<string>();
      ids.add(source.decisionId);
      selectedByOrg.set(source.organizationId, ids);
    }
    for (const organizationId of [...selectedByOrg.keys()].sort())
      for (const ids of batches(
        [...(selectedByOrg.get(organizationId) ?? [])].sort(),
      )) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM content_learning_decisions WHERE "organizationId" = ${organizationId} AND "isDeleted" = false AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
        );
        if (locked.length !== ids.length)
          throw new ConflictException('Source invalidated during extraction');
      }
    const fresh = new LearningDatasetGraph(tx);
    for (const source of sources) {
      const { account, consent } = await this.source(tx, source);
      const selected = [...provenance.values()].filter(
        (value) => value.accountId === source.accountId,
      );
      for (const part of batches(selected)) {
        const latest = await this.latest(tx, source.organizationId, [
          ...new Set(part.map((value) => value.decisionId)),
        ]);
        const decisions = new Map(
          (
            await tx.contentLearningDecision.findMany({
              where: {
                id: { in: part.map((value) => value.decisionId) },
                organizationId: account.organizationId,
                credentialId: account.credentialId,
                isDeleted: false,
                synthetic: false,
                state: 'published',
                createdAt: { lte: cutoff, gte: consent.grantedAt ?? cutoff },
              },
            })
          ).map((decision) => [decision.id, decision]),
        );
        await fresh.load(
          part.flatMap((value) => [
            {
              kind: 'reward' as const,
              id: value.rewardId,
              organizationId: value.organizationId,
            },
            {
              kind: 'consent' as const,
              id: value.consentId,
              organizationId: value.organizationId,
            },
          ]),
        );
        for (const value of part) {
          const decision = decisions.get(value.decisionId);
          const reward = fresh.rewardFacts.get(
            nodeKey({
              kind: 'reward',
              id: value.rewardId,
              organizationId: value.organizationId,
            }),
          );
          const currentRow =
            decision && reward && consent.grantedAt
              ? validateLearningRows(
                  [
                    {
                      sourceFingerprint: reward.sourceFingerprint,
                      accountGroup: account.id,
                      decisionAt: decision.createdAt.toISOString(),
                      measuredAt: reward.createdAt.toISOString(),
                      features: decision.contextVector,
                      armId: decision.selectedArmId,
                      probabilities: decision.probabilities,
                      reward: reward.composite,
                      synthetic: false,
                    },
                  ],
                  cutoff,
                )[0]
              : null;
          if (
            account.credentialId !== value.credentialId ||
            consent.id !== value.consentId ||
            consent.version !== value.consentVersion ||
            latest.get(value.decisionId) !== value.rewardVersion ||
            decision?.payloadHash !== value.decisionPayloadHash ||
            reward?.status !== 'valid' ||
            !currentRow ||
            learningHash(currentRow) !== value.rowHash ||
            !fresh.valid({
              kind: 'reward',
              id: value.rewardId,
              organizationId: value.organizationId,
            }) ||
            !fresh.valid({
              kind: 'consent',
              id: value.consentId,
              organizationId: value.organizationId,
            })
          )
            throw new ConflictException('Source invalidated during extraction');
        }
      }
    }
    const dataset = await tx.contentLearningDataset.create({
      data: {
        origin: synthetic
          ? 'synthetic'
          : input.rows && provenance.size
            ? 'mixed'
            : input.rows
              ? 'owned'
              : 'consented',
        ownerActorId: input.actorId,
        rightsStatement: input.rightsStatement,
        schemaVersion: 'numeric-nine-v1',
        profile: input.profile,
        cell: input.cell,
        cutoff,
        manifestHash,
        manifest: toPrismaJson({
          schemaVersion: 'numeric-nine-v1',
          count: rows.length,
        }),
        status:
          rows.filter((row) => split(row) === 'training').length < 30
            ? 'insufficient_data'
            : 'validated',
        counts: toPrismaJson({
          training: rows.filter((row) => split(row) === 'training').length,
          temporalHoldout: temporal.size,
          accountHoldout: rows.filter((row) => split(row) === 'account_holdout')
            .length,
          total: rows.length,
        }),
        synthetic,
      },
    });
    for (const part of batches(rows))
      await tx.contentLearningDatasetEntry.createMany({
        data: part.map((row) => {
          const source = provenance.get(row.sourceFingerprint);
          return {
            datasetId: dataset.id,
            sourceFingerprint: row.sourceFingerprint,
            sourceReference: toPrismaJson(
              source
                ? { rewardId: source.rewardId, consentId: source.consentId }
                : { ownedLogFingerprint: row.sourceFingerprint },
            ),
            accountGroup: row.accountGroup,
            decisionAt: new Date(row.decisionAt),
            measuredAt: new Date(row.measuredAt),
            features: row.features,
            armId: row.armId,
            probabilities: toPrismaJson(row.probabilities),
            reward: row.reward,
            split: split(row),
            synthetic: row.synthetic,
          };
        }),
      });
    const refs = new Map<string, LearningDependencyRefV1>();
    for (const source of provenance.values())
      for (const node of [
        {
          kind: 'reward' as const,
          id: source.rewardId,
          organizationId: source.organizationId,
        },
        {
          kind: 'consent' as const,
          id: source.consentId,
          organizationId: source.organizationId,
        },
      ]) {
        const ref = fresh.ref(node);
        refs.set(JSON.stringify(ref), ref);
      }
    if (
      !validLearningDependencyRef({
        kind: 'dataset',
        id: dataset.id,
        organizationId: null,
        version: dataset.manifestHash,
      })
    )
      throw new ConflictException('Invalid dataset dependency identity');
    for (const part of batches([...refs.values()]))
      await tx.contentLearningDependency.createMany({
        data: part.map((ref) => ({
          sourceKind: ref.kind,
          sourceId: ref.id,
          sourceVersion: ref.version,
          sourceOrganizationId: ref.organizationId,
          derivedKind: 'dataset',
          derivedId: dataset.id,
          derivedOrganizationId: null,
        })),
      });
    return dataset;
  }
}
