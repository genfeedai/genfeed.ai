import { createHmac, randomBytes } from 'node:crypto';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningNumericRow } from '@genfeedai/contracts';
import { assertLearningFeatures, LEARNING_ARMS } from '@genfeedai/harness';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

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
@Injectable()
export class LearningDatasetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async create(input: {
    actorId: string;
    rightsStatement: string;
    profile: string;
    cell: string;
    cutoff: string;
    rows?: unknown;
    sourceAccountIds?: string[];
  }) {
    if (input.rightsStatement.length < 1 || input.rightsStatement.length > 2000)
      throw new BadRequestException(
        'Explicit owned rights attestation required',
      );
    const cutoff = new Date(input.cutoff);
    if (!Number.isFinite(cutoff.getTime()) || cutoff > new Date())
      throw new BadRequestException('Invalid immutable cutoff');
    let rows: LearningNumericRow[] = [];
    const provenance: Array<{
      fingerprint: string;
      rewardId: string;
      consentId: string;
    }> = [];
    if (input.rows) rows = validateLearningRows(input.rows, cutoff);
    for (const id of input.sourceAccountIds ?? []) {
      const account = await this.prisma.contentLearningAccount.findFirst({
        where: { id, isDeleted: false },
      });
      if (!account?.sharingConsentVersion)
        throw new BadRequestException(
          'Current owner contribution consent required',
        );
      const consent = await this.prisma.contentLearningConsent.findFirst({
        where: {
          organizationId: account.organizationId,
          accountId: id,
          version: account.sharingConsentVersion,
          granted: true,
          revokedAt: null,
          isDeleted: false,
        },
      });
      if (!consent) throw new BadRequestException('Consent withdrawn');
      const rewards = await this.prisma.contentLearningReward.findMany({
        where: {
          organizationId: account.organizationId,
          credentialId: account.credentialId,
          status: 'valid',
          isDeleted: false,
          createdAt: { lte: cutoff },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100001,
      });
      for (const reward of rewards) {
        if (
          reward.composite == null ||
          !(await this.dependencies.valid('reward', reward.id))
        )
          continue;
        const latest = await this.prisma.contentLearningReward.findFirst({
          where: {
            organizationId: account.organizationId,
            decisionId: reward.decisionId,
            isDeleted: false,
          },
          orderBy: { version: 'desc' },
        });
        if (latest?.id !== reward.id) continue;
        const decision = await this.prisma.contentLearningDecision.findFirst({
          where: {
            id: reward.decisionId,
            organizationId: account.organizationId,
            credentialId: account.credentialId,
            isDeleted: false,
            synthetic: false,
            state: 'published',
            createdAt: { lte: cutoff },
          },
        });
        if (!decision) continue;
        if (!consent.grantedAt || decision.createdAt < consent.grantedAt)
          continue;
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
        rows.push(row);
        provenance.push({
          fingerprint: row.sourceFingerprint,
          rewardId: reward.id,
          consentId: consent.id,
        });
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
    const temporal = new Set<string>();
    for (const account of groups.filter((id) => !holdout.has(id))) {
      const accountRows = rows.filter((row) => row.accountGroup === account);
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
    return this.prisma.$transaction(async (tx) => {
      for (const source of provenance)
        if (
          !(await this.dependencies.valid('reward', source.rewardId, tx)) ||
          !(await tx.contentLearningConsent.findFirst({
            where: {
              id: source.consentId,
              granted: true,
              revokedAt: null,
              isDeleted: false,
            },
          }))
        )
          throw new BadRequestException('Source invalidated during extraction');
      const dataset = await tx.contentLearningDataset.create({
        data: {
          origin: synthetic
            ? 'synthetic'
            : input.rows && provenance.length
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
            accountHoldout: rows.filter(
              (row) => split(row) === 'account_holdout',
            ).length,
            total: rows.length,
          }),
          synthetic,
        },
      });
      for (const row of rows) {
        const source = provenance.find(
          (item) => item.fingerprint === row.sourceFingerprint,
        );
        await tx.contentLearningDatasetEntry.create({
          data: {
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
          },
        });
        if (source) {
          await this.dependencies.link(
            tx,
            'reward',
            source.rewardId,
            'current',
            'dataset',
            dataset.id,
          );
          await this.dependencies.link(
            tx,
            'consent',
            source.consentId,
            'current',
            'dataset',
            dataset.id,
          );
        }
      }
      return dataset;
    });
  }
}
