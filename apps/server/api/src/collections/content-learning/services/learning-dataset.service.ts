import { createHmac, randomBytes } from 'node:crypto';
import {
  assertLearningDatasetCandidateCount,
  batches,
  DATASET_BATCH_SIZE,
  DATASET_MAX_ROWS,
  type DatasetReward,
  DECISION_SELECT,
  LearningDatasetGraph,
  nodeKey,
  REWARD_SELECT,
  selectionTooLarge,
} from '@api/collections/content-learning/services/learning-dataset-graph.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type LearningDatasetSourceAccount,
  type LearningDependencyRefV1,
  type LearningNumericRow,
  validLearningDependencyRef,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { assertLearningFeatures, LEARNING_ARMS } from '@genfeedai/harness';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

function rewardSnapshotHash(row: DatasetReward) {
  return learningHash([
    row.organizationId,
    row.credentialId,
    row.decisionId,
    row.version,
    row.composite,
    row.sourceFingerprint,
    row.createdAt.toISOString(),
    row.checkpointId,
    row.baselineId,
  ]);
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
type DatasetProvenance = {
  fingerprint: string;
  rewardId: string;
  rewardVersion: number;
  decisionId: string;
  decisionPayloadHash: string;
  rowHash: string;
  rewardHash: string;
  grantedAt: string;
  consentId: string;
  consentVersion: number;
  accountId: string;
  credentialId: string;
  organizationId: string;
};
type DatasetSelection = {
  input: LearningDatasetCreationInput;
  cutoff: Date;
  rows: LearningNumericRow[];
  provenance: Map<string, DatasetProvenance>;
  sources: LearningDatasetSourceAccount[];
  graph: LearningDatasetGraph;
  examined: number;
};
type DatasetSource = {
  account: Prisma.ContentLearningAccountGetPayload<Record<string, never>>;
  consent: Prisma.ContentLearningConsentGetPayload<Record<string, never>>;
};
type DatasetDecision = Prisma.ContentLearningDecisionGetPayload<{
  select: typeof DECISION_SELECT;
}>;
type DatasetManifest = {
  temporal: Set<string>;
  split: (
    row: LearningNumericRow,
  ) => 'account_holdout' | 'temporal_holdout' | 'training';
  synthetic: boolean;
  manifestHash: string;
};
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
    const selection = this.prepareSelection(input, tx);
    await this.extractSources(selection, tx);
    const manifest = this.prepareManifest(selection);
    await this.lockSelectedDecisions(selection, tx);
    const fresh = await this.revalidateSources(selection, tx);
    return this.persistSnapshot(selection, manifest, fresh, tx);
  }
  private prepareSelection(
    input: LearningDatasetCreationInput,
    tx: Prisma.TransactionClient,
  ): DatasetSelection {
    if (input.rightsStatement.length < 1 || input.rightsStatement.length > 2000)
      throw new BadRequestException(
        'Explicit owned rights attestation required',
      );
    const cutoff = new Date(input.cutoff);
    if (!Number.isFinite(cutoff.getTime()) || cutoff > new Date())
      throw new BadRequestException('Invalid immutable cutoff');
    let rows: LearningNumericRow[] = [];
    const provenance = new Map<string, DatasetProvenance>();
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
    return {
      input,
      cutoff,
      rows,
      provenance,
      sources,
      graph: new LearningDatasetGraph(tx),
      examined: 0,
    };
  }
  private async extractSources(
    selection: DatasetSelection,
    tx: Prisma.TransactionClient,
  ) {
    for (const source of selection.sources)
      await this.extractSource(selection, await this.source(tx, source), tx);
  }
  private async extractSource(
    selection: DatasetSelection,
    source: DatasetSource,
    tx: Prisma.TransactionClient,
  ) {
    const { account, consent } = source,
      { cutoff, graph } = selection;
    let cursor: string | undefined;
    for (;;) {
      const rewards = await tx.contentLearningReward.findMany({
        select: REWARD_SELECT,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          organizationId: account.organizationId,
          credentialId: account.credentialId,
          status: 'valid',
          isDeleted: false,
          createdAt: { lte: cutoff },
        },
        orderBy: { id: 'asc' },
        take: DATASET_BATCH_SIZE,
      });
      if (!rewards.length) break;
      cursor = rewards[rewards.length - 1].id;
      selection.examined += rewards.length;
      assertLearningDatasetCandidateCount(selection.examined);
      const decisionIds = [
        ...new Set(rewards.map((reward) => reward.decisionId)),
      ];
      const latest = await this.latest(tx, account.organizationId, decisionIds);
      const decisions = new Map(
        (
          await tx.contentLearningDecision.findMany({
            select: DECISION_SELECT,
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
      this.appendEligibleRewards(selection, source, eligible, decisions);
    }
  }
  private appendEligibleRewards(
    selection: DatasetSelection,
    source: DatasetSource,
    eligible: DatasetReward[],
    decisions: Map<string, DatasetDecision>,
  ) {
    const { account, consent } = source,
      { rows, provenance, cutoff, graph } = selection;
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
        rewardHash: rewardSnapshotHash(reward),
        grantedAt: consent.grantedAt.toISOString(),
        consentId: consent.id,
        consentVersion: consent.version,
        accountId: account.id,
        credentialId: account.credentialId,
        organizationId: account.organizationId,
      });
      if (rows.length > DATASET_MAX_ROWS) selectionTooLarge();
    }
  }
  private prepareManifest(selection: DatasetSelection): DatasetManifest {
    const { input, cutoff } = selection;
    let { rows } = selection;
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

    selection.rows = rows;
    return { temporal, split, synthetic, manifestHash };
  }
  private async lockSelectedDecisions(
    selection: DatasetSelection,
    tx: Prisma.TransactionClient,
  ) {
    const { provenance } = selection;
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
  }
  private async revalidateSources(
    selection: DatasetSelection,
    tx: Prisma.TransactionClient,
  ) {
    const fresh = new LearningDatasetGraph(tx);
    for (const source of selection.sources) {
      const current = await this.source(tx, source);
      const selected = [...selection.provenance.values()].filter(
        (value) => value.accountId === source.accountId,
      );
      for (const part of batches(selected))
        await this.revalidateBatch(
          selection,
          current,
          source.organizationId,
          part,
          fresh,
          tx,
        );
    }
    return fresh;
  }
  private async revalidateBatch(
    selection: DatasetSelection,
    current: DatasetSource,
    organizationId: string,
    part: DatasetProvenance[],
    fresh: LearningDatasetGraph,
    tx: Prisma.TransactionClient,
  ) {
    const { account, consent } = current,
      { cutoff } = selection;
    const latest = await this.latest(tx, organizationId, [
      ...new Set(part.map((value) => value.decisionId)),
    ]);
    const decisions = new Map(
      (
        await tx.contentLearningDecision.findMany({
          select: DECISION_SELECT,
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
        !reward ||
        rewardSnapshotHash(reward) !== value.rewardHash ||
        consent.grantedAt?.toISOString() !== value.grantedAt ||
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
  private async persistSnapshot(
    selection: DatasetSelection,
    manifest: DatasetManifest,
    fresh: LearningDatasetGraph,
    tx: Prisma.TransactionClient,
  ) {
    const { input, rows, cutoff, provenance } = selection,
      { synthetic, manifestHash, temporal, split } = manifest;
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
    await this.persistEntries(selection, manifest, dataset.id, tx);
    await this.persistDependencies(selection, fresh, dataset, tx);
    return dataset;
  }
  private async persistEntries(
    selection: DatasetSelection,
    manifest: DatasetManifest,
    datasetId: string,
    tx: Prisma.TransactionClient,
  ) {
    const { rows, provenance } = selection,
      { split } = manifest;
    for (const part of batches(rows))
      await tx.contentLearningDatasetEntry.createMany({
        data: part.map((row) => {
          const source = provenance.get(row.sourceFingerprint);
          return {
            datasetId,
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
  }
  private async persistDependencies(
    selection: DatasetSelection,
    fresh: LearningDatasetGraph,
    dataset: Prisma.ContentLearningDatasetGetPayload<Record<string, never>>,
    tx: Prisma.TransactionClient,
  ) {
    const { provenance } = selection;
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
  }
}
