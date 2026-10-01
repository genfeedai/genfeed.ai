import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import {
  buildLearningBaselineMaterialization,
  type LearningBaselineMaterializationProjection,
} from '@api/collections/content-learning/services/learning-baseline-materialization.helper';
import { LearningBaselineMaterializationService } from '@api/collections/content-learning/services/learning-baseline-materialization.service';
import { parseLearningMeasurement } from '@api/collections/content-learning/services/learning-baseline-selection';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationDependencyRefsV1,
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  LearningPublicationApprovalRow,
  LearningPublicationAssociationV1,
  LearningPublicationBrandRow,
  LearningPublicationCredentialRow,
  LearningPublicationFinalizationRow,
  LearningPublicationOrganizationRow,
  LearningPublicationPinRow,
  LearningPublicationPostRow,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  LearningCellDescriptor,
  LearningDependencyRefV1,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningBaseline,
  type ContentLearningCheckpoint,
  type ContentLearningDependency,
  type ContentLearningScopeState,
  type Post,
  Prisma,
} from '@genfeedai/prisma';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@api/shared/modules/prisma/prisma.module', () => ({
  PrismaModule: class {},
}));
const cutoff = new Date('2026-10-03T00:00:00.000Z');
const published = new Date('2026-10-01T00:00:00.000Z');
function descriptor(): LearningCellDescriptor {
  const profile = learningRegisteredProfiles(
    'twitter',
    'text',
    'engagement',
  ).find((row) => row.capability.mask === 'LCS');
  if (!profile) throw new Error('Registered fixture unavailable');
  return structuredClone(profile.descriptor);
}
function account(): ContentLearningAccount {
  return {
    id: 'account',
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    mode: 'shadow',
    revision: 3,
    epoch: 2,
    evidenceRevision: 7,
    resetAt: null,
    activeConfigVersion: 'rl-reward-v1-experimental',
    sharingConsentVersion: null,
    sharedReleasePreference: 'automatic',
    pinnedReleaseId: null,
    activePolicyId: null,
    approvedArmIds: [],
    pilotStartedAt: null,
    prePilotReleaseId: null,
    failureReason: null,
    driftState: null,
  };
}
function scopeState(
  scope: LearningScope,
  cell: LearningCellDescriptor,
): ContentLearningScopeState {
  return {
    id: 'state',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey: learningScopeKey(scope),
    epoch: 2,
    revision: 1,
    activePolicyId: null,
    pinnedPolicyId: null,
    lastValidRewardAt: null,
    cellDescriptor: { ...structuredClone(cell) },
    descriptorHash: scope.rewardProfileId,
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
  };
}
function baseline(
  projection: LearningBaselineMaterializationProjection,
  cell: LearningCellDescriptor,
  id = 'baseline',
): ContentLearningBaseline {
  return {
    id,
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    fingerprint: projection.fingerprint,
    scopeKey: projection.scopeKey,
    cellDescriptor: { ...structuredClone(cell) },
    descriptorHash: projection.descriptorHash,
    cutoff: projection.cutoff,
    snapshotEpoch: projection.epoch,
    snapshotEvidenceRevision: projection.evidenceRevision,
    expiresAt: projection.expiresAt,
    configVersion: cell.configVersion,
    contributorCheckpointIds: projection.contributorCheckpointIds,
    contributorRevisions: projection.contributorRevisions,
    count: projection.count,
    medianExposure: projection.medianExposure,
    samples: projection.samples.map((row) => ({ ...row })),
    validity: projection.count >= 20 ? 'valid' : 'insufficient_baseline',
  };
}
function publication(index: number, cell: LearningCellDescriptor) {
  const postId = `post-${String(index).padStart(3, '0')}`;
  const post: LearningPublicationPostRow &
    Pick<Post, 'learningAttemptId' | 'updatedAt'> = {
    id: postId,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    isDeleted: false,
    category: PostCategory.TEXT,
    description: `content-${index}`,
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    groupId: null,
    isRepeat: false,
    isShareToFeedSelected: true,
    label: null,
    maxRepeats: null,
    nextScheduledDate: null,
    order: 0,
    originalPostId: null,
    parentId: null,
    platform: Platform.TWITTER,
    publishIntent: null,
    quoteTweetId: null,
    repeatDaysOfWeek: [],
    repeatEndDate: null,
    repeatFrequency: null,
    repeatInterval: null,
    scheduleSlot: null,
    scheduledDate: null,
    targetAttachments: [],
    targetSettings: {},
    timezone: 'UTC',
    variantId: null,
    format: PostFormat.STANDARD,
    visibility: PostVisibility.PUBLIC,
    targetExecutionState: TargetExecutionState.PUBLISHED,
    externalId: `external-${index}`,
    publishedAt: published,
    publishApprovalId: `approval-${index}`,
    reviewVersionPinId: `pin-${index}`,
    _count: { ingredients: 0, children: 0 },
    learningAttemptId: null,
    updatedAt: cutoff,
  };
  const pin: LearningPublicationPinRow = {
    id: `pin-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    recordKind: 'post',
    recordId: postId,
    contentDigest: buildArtifactContentDigest({
      ...projectPostArtifactMaterial(
        readArtifactRecord({ ...post, ingredients: [] }),
      ),
      children: [],
    }),
  };
  const approval: LearningPublicationApprovalRow = {
    id: `approval-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    postId,
    artifactVersionPinId: pin.id,
    operationId: `operation-${index}`,
    status: PublishApprovalStatus.PUBLISHED,
    invalidatedAt: null,
    scopeDigest: `scope-${index}`,
  };
  const association: LearningPublicationAssociationV1 = {
    version: 1,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    approvalId: approval.id,
    approvalOperationId: approval.operationId,
    versionPinId: pin.id,
    platform: Platform.TWITTER,
    externalId: `external-${index}`,
    publishedAt: published.toISOString(),
    contentDigest: pin.contentDigest,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      postId,
      platform: Platform.TWITTER,
      externalId: `external-${index}`,
      publishedAt: published.toISOString(),
      description: post.description,
    }),
  };
  const finalization: LearningPublicationFinalizationRow = {
    id: `finalization-${index}`,
    organizationId: 'org',
    postId,
    result: {
      success: true,
      isProviderDraft: false,
      executionState: 'published',
      platform: 'twitter',
      externalId: `external-${index}`,
      learningPublication: { ...association },
    },
  };
  const checkpoint: ContentLearningCheckpoint = {
    id: `checkpoint-${String(index).padStart(3, '0')}`,
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    windowId: '48h-v1',
    revision: 1,
    sourceAttemptId: `attempt-${index}`,
    dueAt: cutoff,
    requestStartedAt: cutoff,
    receivedAt: cutoff,
    providerAsOf: null,
    sourceAnalyticsId: `analytics-${index}`,
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      measurement: { exposure: 1000 + index, weightedActions: index },
      profiles: [
        {
          profileId: learningHash(learningDescriptorTuple(cell)),
          descriptor: { ...structuredClone(cell) },
          measurement: { exposure: 1000 + index, weightedActions: index },
        },
      ],
    },
    format: 'text',
    publishedAt: published,
    organicProvenance: { isPaid: false, isPinned: false, source: 'provider' },
    sourceFingerprint: `fingerprint-${index}`,
    supersedesId: null,
    validity: 'valid',
    attestation: null,
  };
  const refs = learningPublicationDependencyRefsV1({
    ...association,
    finalizationId: finalization.id,
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash([
      'learning-publication-approval-v1',
      'org',
      'brand',
      postId,
      approval.id,
      approval.operationId,
      pin.id,
      pin.contentDigest,
      approval.scopeDigest,
    ]),
  });
  const edges = refs.map(
    (ref, i): ContentLearningDependency => ({
      id: `source-${index}-${i}`,
      isDeleted: false,
      createdAt: cutoff,
      updatedAt: cutoff,
      sourceKind: ref.kind,
      sourceId: ref.id,
      sourceOrganizationId: ref.organizationId,
      sourceVersion: ref.version,
      derivedKind: 'checkpoint',
      derivedId: checkpoint.id,
      derivedOrganizationId: 'org',
      valid: true,
      invalidatedAt: null,
    }),
  );
  return { post, pin, approval, finalization, checkpoint, edges };
}
function fingerprintError(target: unknown = ['fingerprint']) {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'fixture',
    meta: { target },
  });
}
async function fixture(count = 0, realDependency = false) {
  const cell = descriptor();
  const scope: LearningScope = {
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    platform: 'twitter',
    format: 'text',
    objective: 'engagement',
    rewardProfileId: learningHash(learningDescriptorTuple(cell)),
  };
  const accountRow = account(),
    stateRow = scopeState(scope, cell);
  const organization: LearningPublicationOrganizationRow = {
    id: 'org',
    isDeleted: false,
  };
  const brand: LearningPublicationBrandRow = {
    id: 'brand',
    organizationId: 'org',
    isDeleted: false,
    isActive: true,
  };
  const credential: LearningPublicationCredentialRow = {
    id: 'credential',
    organizationId: 'org',
    brandId: 'brand',
    isDeleted: false,
    isConnected: true,
    platform: 'TWITTER',
  };
  const publications = Array.from({ length: count }, (_, i) =>
    publication(i, cell),
  );
  const baselines: ContentLearningBaseline[] = [];
  const baselineEdges: ContentLearningDependency[] = [];
  const availability = {
    account: true,
    state: true,
    organization: true,
    brand: true,
    credential: true,
  };
  const trace: string[] = [];
  const transactions: Array<{
    client: PrismaService;
    raw: ReturnType<typeof vi.fn>;
    baselineReads: ReturnType<typeof vi.fn>;
  }> = [];
  const hooks: {
    beforeCreate?: (
      data: Prisma.ContentLearningBaselineUncheckedCreateInput,
    ) => void;
    afterRollback?: () => void;
    onCheckpointRead?: (id: string, number: number) => void;
    beforeLink?: (number: number) => void;
    onAccountRead?: (number: number) => void;
    onSourceRead?: (kind: string, number: number) => void;
    onBaselineRead?: (
      args: Prisma.ContentLearningBaselineFindFirstArgs,
    ) => void;
  } = {};
  let accountReads = 0,
    checkpointReads = 0,
    sourceReads = 0,
    linkCalls = 0;
  const blocked = vi.fn(() => {
    throw new Error('Unowned write/lock');
  });
  const create = vi
    .fn()
    .mockImplementation(
      async ({
        data,
      }: {
        data: Prisma.ContentLearningBaselineUncheckedCreateInput;
      }): Promise<ContentLearningBaseline> => {
        hooks.beforeCreate?.(data);
        if (
          !validLearningDescriptor(data.cellDescriptor) ||
          !Array.isArray(data.samples) ||
          !Array.isArray(data.contributorCheckpointIds) ||
          !Array.isArray(data.contributorRevisions)
        )
          throw new Error('Invalid typed baseline fixture input');
        const samples = data.samples.map((value) => {
          const parsed = parseLearningMeasurement(value);
          if (!parsed) throw new Error('Invalid fixture measurement');
          return { ...parsed };
        });
        const row: ContentLearningBaseline = {
          id: `baseline-${baselines.length}`,
          isDeleted: false,
          createdAt: cutoff,
          updatedAt: cutoff,
          organizationId: data.organizationId,
          brandId: data.brandId,
          credentialId: data.credentialId,
          fingerprint: data.fingerprint,
          scopeKey: data.scopeKey,
          descriptorHash: data.descriptorHash ?? null,
          cellDescriptor: { ...data.cellDescriptor },
          cutoff:
            data.cutoff instanceof Date
              ? new Date(data.cutoff.getTime())
              : new Date(data.cutoff),
          snapshotEpoch: data.snapshotEpoch ?? null,
          snapshotEvidenceRevision: data.snapshotEvidenceRevision ?? null,
          expiresAt:
            data.expiresAt instanceof Date
              ? new Date(data.expiresAt.getTime())
              : typeof data.expiresAt === 'string'
                ? new Date(data.expiresAt)
                : null,
          configVersion: data.configVersion,
          contributorCheckpointIds: data.contributorCheckpointIds,
          contributorRevisions: data.contributorRevisions,
          count: data.count,
          medianExposure: data.medianExposure,
          samples,
          validity: data.validity,
        };
        baselines.push(row);
        return structuredClone(row);
      },
    );
  const boundary = {
    // Positive unit seam: current publication helper remains real; legacy pinned ABI is NOT certified by this fake.
    valid: vi.fn().mockResolvedValue(true),
    link: vi
      .fn()
      .mockImplementation(
        async (
          client: Prisma.TransactionClient,
          source: LearningDependencyRefV1,
          derived: LearningDependencyRefV1,
        ): Promise<ContentLearningDependency> => {
          linkCalls++;
          hooks.beforeLink?.(linkCalls);
          const row: ContentLearningDependency = {
            id: `baseline-edge-${baselineEdges.length}`,
            isDeleted: false,
            createdAt: cutoff,
            updatedAt: cutoff,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceOrganizationId: source.organizationId,
            sourceVersion: source.version,
            derivedKind: derived.kind,
            derivedId: derived.id,
            derivedOrganizationId: derived.organizationId,
            valid: true,
            invalidatedAt: null,
          };
          if (
            !transactions.some((tx) => tx.client === client) ||
            derived.kind !== 'baseline' ||
            derived.organizationId !== 'org'
          )
            throw new Error('Wrong link client/scope');
          baselineEdges.push(row);
          return structuredClone(row);
        },
      ),
  };
  async function transaction<T>(
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const savedBaselines = structuredClone(baselines),
      savedEdges = structuredClone(baselineEdges);
    const raw = vi
      .fn()
      .mockImplementation(
        async (parts: TemplateStringsArray, ...values: unknown[]) => {
          const sql = parts.join('?');
          trace.push(
            sql.includes('advisory')
              ? 'F'
              : sql.includes('content_learning_accounts')
                ? 'account-lock'
                : 'scope-lock',
          );
          if (sql.includes('advisory')) return [];
          return [{ id: values[0] }];
        },
      );
    const baselineReads = vi
      .fn()
      .mockImplementation(
        async (
          args: Prisma.ContentLearningBaselineFindFirstArgs,
        ): Promise<ContentLearningBaseline | null> => {
          hooks.onBaselineRead?.(args);
          const where = args.where;
          const rows = baselines.filter(
            (row) =>
              !row.isDeleted &&
              row.organizationId === where?.organizationId &&
              row.brandId === where?.brandId &&
              row.credentialId === where?.credentialId &&
              (typeof where?.fingerprint === 'string'
                ? row.fingerprint === where.fingerprint
                : row.scopeKey === where?.scopeKey &&
                  row.descriptorHash === where?.descriptorHash &&
                  row.configVersion === where?.configVersion &&
                  row.snapshotEpoch === where?.snapshotEpoch &&
                  row.snapshotEvidenceRevision ===
                    where?.snapshotEvidenceRevision &&
                  ['valid', 'insufficient_baseline'].includes(row.validity) &&
                  (!(
                    where?.cutoff &&
                    typeof where.cutoff === 'object' &&
                    'lte' in where.cutoff &&
                    where.cutoff.lte instanceof Date
                  ) ||
                    row.cutoff <= where.cutoff.lte)),
          );
          rows.sort(
            (a, b) =>
              b.cutoff.getTime() - a.cutoff.getTime() ||
              b.id.localeCompare(a.id),
          );
          return structuredClone(rows[0] ?? null);
        },
      );
    const delegates = {
      $queryRaw: raw,
      $executeRaw: blocked,
      $transaction: blocked,
      contentLearningAccount: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              _args: Prisma.ContentLearningAccountFindFirstArgs,
            ): Promise<ContentLearningAccount | null> => {
              trace.push('account');
              hooks.onAccountRead?.(++accountReads);
              return availability.account ? structuredClone(accountRow) : null;
            },
          ),
        update: blocked,
        updateMany: blocked,
      },
      contentLearningScopeState: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              _args: Prisma.ContentLearningScopeStateFindFirstArgs,
            ): Promise<ContentLearningScopeState | null> => {
              trace.push('scope');
              return availability.state ? structuredClone(stateRow) : null;
            },
          ),
        updateMany: blocked,
      },
      organization: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              _args: Prisma.OrganizationFindFirstArgs,
            ): Promise<LearningPublicationOrganizationRow | null> => {
              trace.push('org');
              hooks.onSourceRead?.('org', ++sourceReads);
              return availability.organization
                ? structuredClone(organization)
                : null;
            },
          ),
      },
      brand: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              _args: Prisma.BrandFindFirstArgs,
            ): Promise<LearningPublicationBrandRow | null> => {
              trace.push('brand');
              hooks.onSourceRead?.('brand', ++sourceReads);
              return availability.brand ? structuredClone(brand) : null;
            },
          ),
      },
      credential: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              _args: Prisma.CredentialFindFirstArgs,
            ): Promise<LearningPublicationCredentialRow | null> => {
              trace.push('credential');
              hooks.onSourceRead?.('credential', ++sourceReads);
              return availability.credential
                ? structuredClone(credential)
                : null;
            },
          ),
      },
      post: {
        findFirst: vi
          .fn()
          .mockImplementation(async (args: Prisma.PostFindFirstArgs) =>
            structuredClone(
              publications.find((item) => item.post.id === args.where?.id)
                ?.post ?? null,
            ),
          ),
        update: blocked,
      },
      publishApproval: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (args: Prisma.PublishApprovalFindFirstArgs) =>
              structuredClone(
                publications.find((item) => item.approval.id === args.where?.id)
                  ?.approval ?? null,
              ),
          ),
      },
      contentVersionPin: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (args: Prisma.ContentVersionPinFindFirstArgs) =>
              structuredClone(
                publications.find((item) => item.pin.id === args.where?.id)
                  ?.pin ?? null,
              ),
          ),
      },
      postPublishFinalization: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async (args: Prisma.PostPublishFinalizationFindFirstArgs) =>
              structuredClone(
                publications.find(
                  (item) =>
                    item.finalization.postId === args.where?.postId ||
                    item.finalization.id === args.where?.id,
                )?.finalization ?? null,
              ),
          ),
      },
      contentLearningCheckpoint: {
        findMany: vi
          .fn()
          .mockImplementation(
            async (
              args: Prisma.ContentLearningCheckpointFindManyArgs,
            ): Promise<ContentLearningCheckpoint[]> => {
              const dates = args.where?.receivedAt;
              const upper =
                dates && typeof dates === 'object' && 'lte' in dates
                  ? dates.lte
                  : undefined;
              const lower =
                dates && typeof dates === 'object' && 'gte' in dates
                  ? dates.gte
                  : undefined;
              return structuredClone(
                publications
                  .map((item) => item.checkpoint)
                  .filter(
                    (row) =>
                      !row.isDeleted &&
                      row.organizationId === args.where?.organizationId &&
                      row.brandId === args.where?.brandId &&
                      row.credentialId === args.where?.credentialId &&
                      row.format === args.where?.format &&
                      row.validity === 'valid' &&
                      (!(upper instanceof Date) || row.receivedAt <= upper) &&
                      (!(lower instanceof Date) || row.receivedAt >= lower),
                  )
                  .sort(
                    (a, b) =>
                      b.receivedAt.getTime() - a.receivedAt.getTime() ||
                      a.id.localeCompare(b.id),
                  )
                  .slice(0, 100),
              );
            },
          ),
        findFirst: vi
          .fn()
          .mockImplementation(
            async (
              args: Prisma.ContentLearningCheckpointFindFirstArgs,
            ): Promise<ContentLearningCheckpoint | null> => {
              const id = args.where?.id;
              if (typeof id !== 'string') return null;
              hooks.onCheckpointRead?.(id, ++checkpointReads);
              const row = publications.find(
                (item) => item.checkpoint.id === id,
              )?.checkpoint;
              return row &&
                !row.isDeleted &&
                (args.where?.revision === undefined ||
                  args.where.revision === row.revision)
                ? structuredClone(row)
                : null;
            },
          ),
        updateMany: blocked,
      },
      contentLearningDependency: {
        findMany: vi
          .fn()
          .mockImplementation(
            async (
              args: Prisma.ContentLearningDependencyFindManyArgs,
            ): Promise<ContentLearningDependency[]> => {
              if (args.where?.OR) return [];
              const rows = [
                ...baselineEdges,
                ...publications.flatMap((item) => item.edges),
              ]
                .filter(
                  (edge) =>
                    !edge.isDeleted &&
                    edge.derivedKind === args.where?.derivedKind &&
                    edge.derivedId === args.where?.derivedId &&
                    edge.derivedOrganizationId ===
                      args.where?.derivedOrganizationId,
                )
                .sort((a, b) => a.id.localeCompare(b.id));
              return structuredClone(
                typeof args.take === 'number' ? rows.slice(0, args.take) : rows,
              );
            },
          ),
        create: blocked,
        updateMany: blocked,
      },
      contentLearningBaseline: {
        findFirst: baselineReads,
        create,
        update: blocked,
        upsert: blocked,
        updateMany: blocked,
      },
    };
    const module = await Test.createTestingModule({
      providers: [{ provide: PrismaService, useValue: delegates }],
    }).compile();
    const client = module.get<PrismaService>(PrismaService);
    transactions.push({ client, raw, baselineReads });
    try {
      return await apply(client);
    } catch (error) {
      baselines.splice(0, baselines.length, ...savedBaselines);
      baselineEdges.splice(0, baselineEdges.length, ...savedEdges);
      const afterRollback = hooks.afterRollback;
      hooks.afterRollback = undefined;
      afterRollback?.();
      throw error;
    }
  }
  const root = { $transaction: vi.fn(transaction) };
  const module = await Test.createTestingModule({
    providers: [
      LearningBaselineMaterializationService,
      { provide: PrismaService, useValue: root },
      { provide: LearningDependencyService, useValue: boundary },
    ],
  }).compile();
  if (realDependency) {
    const dependencyModule = await Test.createTestingModule({
      providers: [
        LearningDependencyService,
        { provide: PrismaService, useValue: root },
      ],
    }).compile();
    const actual = dependencyModule.get(LearningDependencyService);
    boundary.valid.mockImplementation(
      (kind: string, id: string, tx: Prisma.TransactionClient, org: string) =>
        actual.valid(kind, id, tx, org),
    );
  }
  const service = module.get(LearningBaselineMaterializationService);
  function projection(at = cutoff) {
    const selected = publications
      .map((item) => item.checkpoint)
      .filter(
        (row) =>
          !row.isDeleted &&
          row.validity === 'valid' &&
          row.receivedAt <= at &&
          row.receivedAt.getTime() >= at.getTime() - 90 * 86400000,
      )
      .sort(
        (a, b) =>
          b.receivedAt.getTime() - a.receivedAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 50);
    return buildLearningBaselineMaterialization({
      scope,
      descriptor: cell,
      cutoff: at,
      epoch: accountRow.epoch,
      evidenceRevision: accountRow.evidenceRevision,
      contributors: selected,
      samples: selected.map((row) => {
        const raw = row.measurement;
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          !Array.isArray(raw.profiles)
        )
          throw new Error('Missing fixture profile');
        const profile = raw.profiles.find(
          (item) =>
            item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            item.profileId === scope.rewardProfileId,
        );
        if (!profile || typeof profile !== 'object' || Array.isArray(profile))
          throw new Error('Missing fixture descriptor');
        const sample = parseLearningMeasurement(profile.measurement);
        if (!sample) throw new Error('Invalid fixture sample');
        return sample;
      }),
    });
  }
  function install(row: ContentLearningBaseline) {
    baselines.push(row);
    baselineEdges.push(
      ...row.contributorCheckpointIds.map(
        (id, index): ContentLearningDependency => ({
          id: `existing-${index}`,
          isDeleted: false,
          createdAt: cutoff,
          updatedAt: cutoff,
          sourceKind: 'checkpoint',
          sourceId: id,
          sourceOrganizationId: 'org',
          sourceVersion: String(row.contributorRevisions[index]),
          derivedKind: 'baseline',
          derivedId: row.id,
          derivedOrganizationId: 'org',
          valid: true,
          invalidatedAt: null,
        }),
      ),
      {
        id: 'existing-config',
        isDeleted: false,
        createdAt: cutoff,
        updatedAt: cutoff,
        sourceKind: 'config',
        sourceId: cell.configVersion,
        sourceOrganizationId: null,
        sourceVersion: cell.configVersion,
        derivedKind: 'baseline',
        derivedId: row.id,
        derivedOrganizationId: 'org',
        valid: true,
        invalidatedAt: null,
      },
    );
  }
  return {
    service,
    scope,
    cell,
    accountRow,
    stateRow,
    organization,
    brand,
    credential,
    publications,
    baselines,
    baselineEdges,
    trace,
    transactions,
    hooks,
    blocked,
    root,
    boundary,
    create,
    projection,
    install,
    availability,
  };
}

describe('immutable materializer with real selector/publication proof and explicit positive Dependency.valid seam', () => {
  it('T1 validates scope/descriptor/cutoff before DB and freezes the request across await', async () => {
    const f = await fixture();
    for (const change of [
      (scope: LearningScope) => {
        scope.organizationId = '';
      },
      (scope: LearningScope) => {
        scope.rewardProfileId = 'guessed';
      },
      (_scope: LearningScope, cell: LearningCellDescriptor) => {
        Reflect.set(cell, 'extra', true);
      },
    ]) {
      const scope = structuredClone(f.scope),
        cell = structuredClone(f.cell);
      change(scope, cell);
      await expect(f.service.materialize(scope, cell, cutoff)).rejects.toThrow(
        'Invalid baseline materialization input',
      );
    }
    await expect(
      f.service.materialize(f.scope, f.cell, new Date(NaN)),
    ).rejects.toThrow('Invalid baseline materialization input');
    expect(f.root.$transaction).not.toHaveBeenCalled();
    f.hooks.onAccountRead = (n) => {
      if (n === 1) {
        f.scope.organizationId = 'mutated';
        f.cell.metricWeights.splice(0);
      }
    };
    const scope = structuredClone(f.scope),
      cell = structuredClone(f.cell);
    expect(await f.service.materialize(f.scope, f.cell, cutoff)).not.toBeNull();
    expect(f.baselines[0].organizationId).toBe(scope.organizationId);
    expect(f.baselines[0].cellDescriptor).toEqual(cell);
  });
  const unavailable: Array<{
    name: string;
    change: (f: Awaited<ReturnType<typeof fixture>>) => void;
  }> = [
    {
      name: 'missing account',
      change: (f) => {
        f.availability.account = false;
      },
    },
    {
      name: 'disabled',
      change: (f) => {
        f.accountRow.mode = 'disabled';
      },
    },
    {
      name: 'foreign account',
      change: (f) => {
        f.accountRow.brandId = 'foreign';
      },
    },
    {
      name: 'deleted account',
      change: (f) => {
        f.accountRow.isDeleted = true;
      },
    },
    {
      name: 'invalid epoch',
      change: (f) => {
        f.accountRow.epoch = -1;
      },
    },
    {
      name: 'invalid evidence',
      change: (f) => {
        f.accountRow.evidenceRevision = NaN;
      },
    },
    {
      name: 'wrong config',
      change: (f) => {
        f.accountRow.activeConfigVersion = 'other';
      },
    },
    {
      name: 'missing scope',
      change: (f) => {
        f.availability.state = false;
      },
    },
    {
      name: 'foreign scope',
      change: (f) => {
        f.stateRow.credentialId = 'other';
      },
    },
    {
      name: 'bad descriptor',
      change: (f) => {
        f.stateRow.cellDescriptor = {};
      },
    },
    {
      name: 'bad descriptor hash',
      change: (f) => {
        f.stateRow.descriptorHash = 'other';
      },
    },
    {
      name: 'bad scope revision',
      change: (f) => {
        f.stateRow.revision = -1;
      },
    },
    {
      name: 'missing organization',
      change: (f) => {
        f.availability.organization = false;
      },
    },
    {
      name: 'deleted organization',
      change: (f) => {
        f.organization.isDeleted = true;
      },
    },
    {
      name: 'foreign organization',
      change: (f) => {
        f.organization.id = 'other';
      },
    },
    {
      name: 'inactive brand',
      change: (f) => {
        f.brand.isActive = false;
      },
    },
    {
      name: 'foreign brand',
      change: (f) => {
        f.brand.organizationId = 'other';
      },
    },
    {
      name: 'deleted brand',
      change: (f) => {
        f.brand.isDeleted = true;
      },
    },
    {
      name: 'missing credential',
      change: (f) => {
        f.availability.credential = false;
      },
    },
    {
      name: 'disconnected credential',
      change: (f) => {
        f.credential.isConnected = false;
      },
    },
    {
      name: 'reassigned credential',
      change: (f) => {
        f.credential.brandId = 'other';
      },
    },
    {
      name: 'unknown platform',
      change: (f) => {
        Reflect.set(f.credential, 'platform', 'UNKNOWN');
      },
    },
  ];
  it.each(unavailable)(
    'T1 returns null for initial $name without source writes',
    async ({ change }) => {
      const f = await fixture();
      change(f);
      expect(await f.service.materialize(f.scope, f.cell, cutoff)).toBeNull();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('T1 uses Fs first then exact scoped account and scope UPDATE locks, with no Post lock', async () => {
    const f = await fixture();
    await f.service.materialize(f.scope, f.cell, cutoff);
    expect(f.trace.slice(0, 10)).toEqual([
      'F',
      'account',
      'account-lock',
      'account',
      'org',
      'brand',
      'credential',
      'scope',
      'scope-lock',
      'scope',
    ]);
    const calls = f.transactions[0].raw.mock.calls;
    expect(calls[0][0].join('')).toBe(
      'SELECT pg_advisory_xact_lock_shared(5728, 1)::text',
    );
    expect(calls[1].slice(1)).toEqual([
      'account',
      'org',
      'brand',
      'credential',
    ]);
    expect(calls[2].slice(1)).toEqual([
      'state',
      'org',
      'brand',
      'credential',
      learningScopeKey(f.scope),
      2,
    ]);
    expect(calls[1][0].join('')).toContain('FOR UPDATE');
    expect(calls[2][0].join('')).toContain('FOR UPDATE');
    expect(calls).toHaveLength(3);
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it.each([0, 19, 20, 50, 51])(
    'T2 projects %i candidates using real selector and pure helper, not end-to-end pinned authority',
    async (count) => {
      const f = await fixture(count);
      const row = await f.service.materialize(f.scope, f.cell, cutoff);
      expect(row).toEqual(baseline(f.projection(), f.cell, 'baseline-0'));
      expect(row?.count).toBe(Math.min(count, 50));
      expect(row?.validity).toBe(
        count >= 20 ? 'valid' : 'insufficient_baseline',
      );
      expect(f.boundary.link).toHaveBeenCalledTimes(Math.min(count, 50) + 1);
      expect(f.accountRow.evidenceRevision).toBe(7);
      if (!count) {
        expect(row?.medianExposure).toBe(0);
        expect(row?.expiresAt).toBeNull();
        expect(f.baselineEdges[0].sourceKind).toBe('config');
      }
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('T2 preserves distinct Posts, tied timestamp ID ordering and exact descriptor masks', async () => {
    const f = await fixture(3);
    const duplicate = structuredClone(f.publications[0]);
    duplicate.checkpoint.id = 'checkpoint-duplicate';
    f.publications.push(duplicate);
    const variant = learningRegisteredProfiles(
      'twitter',
      'text',
      'engagement',
    ).find((row) => row.capability.mask === 'LCSS');
    if (!variant) throw new Error('Missing registered variant');
    f.publications[2].checkpoint.measurement = {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      profiles: [
        {
          profileId: learningHash(learningDescriptorTuple(variant.descriptor)),
          descriptor: { ...variant.descriptor },
          measurement: { exposure: 1000, weightedActions: 0 },
        },
      ],
    };
    const row = await f.service.materialize(f.scope, f.cell, cutoff);
    expect(row?.contributorCheckpointIds).toEqual([
      'checkpoint-000',
      'checkpoint-001',
    ]);
    expect(row?.count).toBe(2);
  });
  it('T2 never selects missing/ninth/invalid publication sources even through the positive boundary seam', async () => {
    for (const change of [
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.publications[0].edges.pop();
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.publications[0].edges.push({
          ...f.publications[0].edges[0],
          id: 'ninth',
        });
      },
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.publications[0].post.visibility = 'private';
      },
    ]) {
      const f = await fixture(1);
      change(f);
      expect(
        (await f.service.materialize(f.scope, f.cell, cutoff))?.count,
      ).toBe(0);
      expect(f.boundary.valid).not.toHaveBeenCalled();
    }
  });
  it('C5 real Dependency and publication resolution materialize a genuine factual checkpoint with null attempt attribution', async () => {
    const f = await fixture(1, true);
    const row = await f.service.materialize(f.scope, f.cell, cutoff);
    expect(row?.count).toBe(1);
    expect(row?.contributorCheckpointIds).toEqual([
      f.publications[0].checkpoint.id,
    ]);
    expect(row?.contributorRevisions).toEqual([
      f.publications[0].checkpoint.revision,
    ]);
    expect(row?.samples).toEqual(f.projection().samples);
    expect(f.publications[0].edges).toHaveLength(8);
    expect(f.publications[0].post.learningAttemptId).toBeNull();
    expect(f.boundary.valid).toHaveBeenCalled();
    expect(
      f.baselineEdges.filter(
        (edge) =>
          edge.derivedKind === 'baseline' && edge.sourceKind === 'checkpoint',
      ),
    ).toHaveLength(1);
  });
  it('C5 real Dependency rejects raw Post-ID legacy evidence without edge repair', async () => {
    const f = await fixture(1, true);
    const edge = f.publications[0].edges.find(
      (item) => item.sourceKind === 'post',
    );
    if (!edge) throw new Error('Missing Post source edge');
    edge.sourceVersion = f.publications[0].post.id;
    const before = structuredClone(f.publications[0].edges);
    const row = await f.service.materialize(f.scope, f.cell, cutoff);
    expect(row?.count).toBe(0);
    expect(row?.contributorCheckpointIds).toEqual([]);
    expect(f.publications[0].edges).toEqual(before);
    expect(
      f.baselineEdges.filter(
        (item) =>
          item.derivedKind === 'baseline' && item.sourceKind === 'checkpoint',
      ),
    ).toEqual([]);
  });
  it('T2 retention descriptor with missing watch is excluded by the unchanged real selector', async () => {
    const f = await fixture(1);
    const profile = learningRegisteredProfiles(
      'youtube',
      'video',
      'retention-watch',
    )[0];
    if (!profile) throw new Error('Missing retention profile');
    const cell = profile.descriptor;
    const scope: LearningScope = {
      ...f.scope,
      platform: 'youtube',
      format: 'video',
      objective: 'retention-watch',
      rewardProfileId: learningHash(learningDescriptorTuple(cell)),
    };
    Object.assign(f.stateRow, {
      scopeKey: learningScopeKey(scope),
      cellDescriptor: { ...structuredClone(cell) },
      descriptorHash: scope.rewardProfileId,
    });
    f.credential.platform = 'YOUTUBE';
    f.publications[0].checkpoint.format = 'video';
    f.publications[0].checkpoint.measurement = {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      profiles: [
        {
          profileId: scope.rewardProfileId,
          descriptor: { ...structuredClone(cell) },
          measurement: { exposure: 1000, weightedActions: 0 },
        },
      ],
    };
    expect((await f.service.materialize(scope, cell, cutoff))?.count).toBe(0);
    expect(f.boundary.valid).not.toHaveBeenCalled();
  });
  it('T3 conflicts when original selected physical observation changes before final proof', async () => {
    const f = await fixture(1);
    f.hooks.onCheckpointRead = (_id, n) => {
      if (n === 8)
        f.publications[0].checkpoint.measurement = {
          collection: { version: 1, outcome: 'observed', reasonCode: null },
          measurement: { exposure: 9999 },
          profiles: [],
        };
    };
    await expect(
      f.service.materialize(f.scope, f.cell, cutoff),
    ).rejects.toThrow('Baseline materialization conflict');
    expect(f.baselines).toEqual([]);
    expect(f.create).not.toHaveBeenCalled();
  });
  it('T3 uses inclusive 90-day selection and exact expiry equality/+1ms', async () => {
    const f = await fixture(1);
    const equality = new Date(cutoff.getTime() + 90 * 86400000);
    const first = await f.service.materialize(f.scope, f.cell, cutoff);
    expect(first?.expiresAt).toEqual(equality);
    const reused = await f.service.materialize(f.scope, f.cell, equality);
    expect(reused?.id).toBe(first?.id);
    expect(f.create).toHaveBeenCalledTimes(1);
    const fresh = await f.service.materialize(
      f.scope,
      f.cell,
      new Date(equality.getTime() + 1),
    );
    expect(fresh?.count).toBe(0);
    expect(fresh?.id).not.toBe(first?.id);
    expect(first?.cutoff).toEqual(cutoff);
  });
  it('T4 reuses verified current tuple at original cutoff with unchanged timestamps and zero new writes', async () => {
    const f = await fixture(2);
    const row = baseline(f.projection(), f.cell, 'existing');
    row.createdAt = published;
    row.updatedAt = published;
    f.install(structuredClone(row));
    expect(
      await f.service.materialize(
        f.scope,
        f.cell,
        new Date(cutoff.getTime() + 1),
      ),
    ).toEqual(row);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.boundary.link).not.toHaveBeenCalled();
    expect(f.accountRow).toEqual(account());
    expect(
      f.transactions[0].baselineReads.mock.calls[0][0].where.snapshotEpoch,
    ).toBe(2);
  });
  it('T4 preserves NULL legacy rows and builds a new immutable snapshot when current contributor identities differ', async () => {
    const legacy = await fixture();
    const old = baseline(legacy.projection(), legacy.cell, 'legacy');
    old.snapshotEpoch = null;
    old.snapshotEvidenceRevision = null;
    old.expiresAt = null;
    old.fingerprint = 'legacy-fingerprint';
    legacy.baselines.push(structuredClone(old));
    const newRow = await legacy.service.materialize(
      legacy.scope,
      legacy.cell,
      cutoff,
    );
    expect(newRow?.id).not.toBe('legacy');
    expect(legacy.baselines[0]).toEqual(old);
    const f = await fixture(1);
    const stored = baseline(f.projection(), f.cell, 'old');
    f.install(structuredClone(stored));
    f.publications[0].checkpoint.validity = 'invalid_source';
    const updated = await f.service.materialize(
      f.scope,
      f.cell,
      new Date(cutoff.getTime() + 1),
    );
    expect(updated?.count).toBe(0);
    expect(updated?.id).not.toBe(stored.id);
    expect(f.baselines[0]).toEqual(stored);
  });
  const corruptions: Array<{
    name: string;
    change: (row: ContentLearningBaseline) => void;
  }> = [
    {
      name: 'descriptor hash',
      change: (row) => {
        row.descriptorHash = 'other';
      },
    },
    {
      name: 'snapshot epoch',
      change: (row) => {
        row.snapshotEpoch = 3;
      },
    },
    {
      name: 'snapshot evidence',
      change: (row) => {
        row.snapshotEvidenceRevision = 8;
      },
    },
    {
      name: 'unexpired expiry mismatch',
      change: (row) => {
        if (row.expiresAt)
          row.expiresAt = new Date(row.expiresAt.getTime() + 1);
      },
    },
    {
      name: 'fingerprint',
      change: (row) => {
        row.fingerprint = 'wrong';
      },
    },
    {
      name: 'median',
      change: (row) => {
        row.medianExposure++;
      },
    },
    {
      name: 'count',
      change: (row) => {
        row.count++;
      },
    },
    {
      name: 'invalid source',
      change: (row) => {
        row.validity = 'invalid_source';
      },
    },
    {
      name: 'descriptor',
      change: (row) => {
        row.cellDescriptor = {};
      },
    },
    {
      name: 'NULL snapshot epoch',
      change: (row) => {
        row.snapshotEpoch = null;
      },
    },
    {
      name: 'NULL evidence',
      change: (row) => {
        row.snapshotEvidenceRevision = null;
      },
    },
    {
      name: 'expires null',
      change: (row) => {
        row.expiresAt = null;
      },
    },
    {
      name: 'extra sample field',
      change: (row) => {
        row.samples = [{ exposure: 1000, weightedActions: 0, extra: 1 }];
      },
    },
    {
      name: 'finite exposure mismatch',
      change: (row) => {
        row.samples = [{ exposure: 1001, weightedActions: 0 }];
      },
    },
    {
      name: 'finite actions mismatch',
      change: (row) => {
        row.samples = [{ exposure: 1000, weightedActions: 1 }];
      },
    },
    {
      name: 'finite watch mismatch',
      change: (row) => {
        row.samples = [
          { exposure: 1000, weightedActions: 0, averageWatchTimeSeconds: 0 },
        ];
      },
    },
  ];
  it.each(corruptions)(
    'T5 conflicts on fingerprint-matched immutable $name without repair',
    async ({ change }) => {
      const f = await fixture(1);
      const row = baseline(f.projection(), f.cell, 'corrupt');
      f.install(row);
      change(row);
      await expect(
        f.service.materialize(f.scope, f.cell, cutoff),
      ).rejects.toThrow('Baseline materialization conflict');
      expect(f.create).not.toHaveBeenCalled();
      expect(f.boundary.link).not.toHaveBeenCalled();
    },
  );
  it('T5 rejects stored array-order corruption through the exact scoped fingerprint check', async () => {
    const f = await fixture(2);
    const row = baseline(f.projection(), f.cell, 'corrupt-order');
    row.contributorCheckpointIds.reverse();
    row.contributorRevisions.reverse();
    if (Array.isArray(row.samples)) row.samples.reverse();
    f.install(row);
    await expect(
      f.service.materialize(f.scope, f.cell, cutoff),
    ).rejects.toThrow('Baseline materialization conflict');
    expect(f.create).not.toHaveBeenCalled();
    expect(f.boundary.link).not.toHaveBeenCalled();
  });
  it('T5 rejects missing/extra/52nd/foreign/invalid baseline edges and never backfills', async () => {
    for (const change of [
      (edges: ContentLearningDependency[]) => {
        edges.pop();
      },
      (edges: ContentLearningDependency[]) => {
        edges.push({ ...edges[0], id: 'duplicate' });
      },
      (edges: ContentLearningDependency[]) => {
        edges[0].sourceOrganizationId = 'foreign';
      },
      (edges: ContentLearningDependency[]) => {
        edges[0].valid = false;
      },
      (edges: ContentLearningDependency[]) => {
        while (edges.length < 52)
          edges.push({ ...edges[0], id: `extra-${edges.length}` });
      },
    ]) {
      const f = await fixture(1);
      f.install(baseline(f.projection(), f.cell));
      change(f.baselineEdges);
      await expect(
        f.service.materialize(f.scope, f.cell, cutoff),
      ).rejects.toThrow('Baseline materialization conflict');
      expect(f.create).not.toHaveBeenCalled();
      expect(f.boundary.link).not.toHaveBeenCalled();
    }
  });
  it('T6 links selected checkpoints in order then global config and rolls back each injected link failure', async () => {
    const good = await fixture(2);
    await good.service.materialize(good.scope, good.cell, cutoff);
    expect(good.boundary.link.mock.calls.map((call) => call[1].kind)).toEqual([
      'checkpoint',
      'checkpoint',
      'config',
    ]);
    expect(good.boundary.link.mock.calls.map((call) => call[1].id)).toEqual([
      'checkpoint-000',
      'checkpoint-001',
      'rl-reward-v1-experimental',
    ]);
    for (let failure = 1; failure <= 3; failure++) {
      const f = await fixture(2);
      const error = new Error(`link-${failure}`);
      f.hooks.beforeLink = (n) => {
        if (n === failure) throw error;
      };
      await expect(f.service.materialize(f.scope, f.cell, cutoff)).rejects.toBe(
        error,
      );
      expect(f.baselines).toEqual([]);
      expect(f.baselineEdges).toEqual([]);
      expect(f.accountRow.evidenceRevision).toBe(7);
    }
  });
  it.each(['revision', 'epoch', 'evidenceRevision', 'mode', 'scopeDescriptor'])(
    'T6 conflicts on final captured-context %s drift and never increments counters',
    async (key) => {
      const f = await fixture();
      f.hooks.onAccountRead = (n) => {
        if (n === 3) {
          if (key === 'scopeDescriptor') f.stateRow.cellDescriptor = {};
          else if (key === 'mode') f.accountRow.mode = 'paused';
          else Reflect.set(f.accountRow, key, 99);
        }
      };
      await expect(
        f.service.materialize(f.scope, f.cell, cutoff),
      ).rejects.toThrow('Baseline materialization conflict');
      expect(f.baselines).toEqual([]);
      expect(f.baselineEdges).toEqual([]);
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('T6 reset preserves factual checkpoint rows but moves immutable snapshot epoch', async () => {
    const f = await fixture(1);
    const facts = structuredClone(f.publications[0].checkpoint);
    f.accountRow.epoch = 3;
    f.stateRow.epoch = 3;
    const row = await f.service.materialize(f.scope, f.cell, cutoff);
    expect(row?.snapshotEpoch).toBe(3);
    expect(f.publications[0].checkpoint).toEqual(facts);
  });
  const lateParents: Array<{
    name: string;
    change: (f: Awaited<ReturnType<typeof fixture>>) => void;
  }> = [
    {
      name: 'organization deletion',
      change: (f) => {
        f.organization.isDeleted = true;
      },
    },
    {
      name: 'brand inactive',
      change: (f) => {
        f.brand.isActive = false;
      },
    },
    {
      name: 'credential disconnect',
      change: (f) => {
        f.credential.isConnected = false;
      },
    },
    {
      name: 'credential reassignment',
      change: (f) => {
        f.credential.brandId = 'other';
      },
    },
    {
      name: 'credential platform',
      change: (f) => {
        f.credential.platform = 'FACEBOOK';
      },
    },
  ];
  it.each(lateParents)(
    'T6/M28 zero-count late $name conflicts on pre-insert, reuse and post-link checks',
    async ({ change }) => {
      for (const branch of ['insert', 'reuse', 'post-link']) {
        const f = await fixture();
        if (branch === 'reuse')
          f.install(baseline(f.projection(), f.cell, 'existing'));
        const before = structuredClone(f.baselines),
          edges = structuredClone(f.baselineEdges);
        f.hooks.onSourceRead = (_kind, n) => {
          if (n === (branch === 'post-link' ? 7 : 4)) change(f);
        };
        await expect(
          f.service.materialize(f.scope, f.cell, cutoff),
        ).rejects.toThrow('Baseline materialization conflict');
        expect(f.baselines).toEqual(before);
        expect(f.baselineEdges).toEqual(edges);
        expect(f.blocked).not.toHaveBeenCalled();
      }
    },
  );
  it('T7 retries fingerprint CREATE P2002 once in a fresh reuse-only transaction after rollback', async () => {
    const f = await fixture();
    const winner = baseline(f.projection(), f.cell, 'winner');
    f.hooks.beforeCreate = () => {
      throw fingerprintError();
    };
    f.hooks.afterRollback = () => {
      f.install(structuredClone(winner));
    };
    expect(await f.service.materialize(f.scope, f.cell, cutoff)).toEqual(
      winner,
    );
    expect(f.root.$transaction).toHaveBeenCalledTimes(2);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.boundary.link).not.toHaveBeenCalled();
    expect(f.transactions[0].client).not.toBe(f.transactions[1].client);
    for (const tx of f.transactions)
      expect(tx.raw.mock.calls[0][0].join('')).toContain(
        'pg_advisory_xact_lock_shared',
      );
    expect(
      f.transactions[1].baselineReads.mock.calls[0][0].where,
    ).toMatchObject({
      fingerprint: winner.fingerprint,
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      isDeleted: false,
    });
  });
  it.each(['absent', 'foreign', 'deleted', 'different fingerprint'])(
    'T7 scoped collision recovery refuses %s without another create or cross-tenant read',
    async (kind) => {
      const f = await fixture();
      const winner = baseline(f.projection(), f.cell, 'winner');
      f.hooks.beforeCreate = () => {
        throw fingerprintError('content_learning_baselines_fingerprint_key');
      };
      f.hooks.afterRollback = () => {
        if (kind === 'absent') return;
        if (kind === 'foreign') winner.organizationId = 'foreign';
        if (kind === 'deleted') winner.isDeleted = true;
        if (kind === 'different fingerprint') winner.fingerprint = 'different';
        f.install(winner);
      };
      await expect(
        f.service.materialize(f.scope, f.cell, cutoff),
      ).rejects.toThrow('Baseline materialization conflict');
      expect(f.root.$transaction).toHaveBeenCalledTimes(2);
      expect(f.create).toHaveBeenCalledTimes(1);
      for (const tx of f.transactions)
        for (const call of tx.baselineReads.mock.calls)
          expect(call[0].where.organizationId).toBe('org');
    },
  );
  it('T7 refuses changed retry context/fingerprint and propagates other create/read/link errors without retry', async () => {
    const drift = await fixture();
    drift.hooks.beforeCreate = () => {
      throw fingerprintError();
    };
    drift.hooks.afterRollback = () => {
      drift.accountRow.evidenceRevision++;
    };
    await expect(
      drift.service.materialize(drift.scope, drift.cell, cutoff),
    ).rejects.toThrow('Baseline materialization conflict');
    expect(drift.create).toHaveBeenCalledTimes(1);
    for (const error of [
      fingerprintError(['other_constraint']),
      new Error('database failure'),
    ]) {
      const f = await fixture();
      f.hooks.beforeCreate = () => {
        throw error;
      };
      await expect(f.service.materialize(f.scope, f.cell, cutoff)).rejects.toBe(
        error,
      );
      expect(f.root.$transaction).toHaveBeenCalledTimes(1);
    }
    const read = await fixture();
    const error = new Error('source read failure');
    read.hooks.onSourceRead = () => {
      throw error;
    };
    await expect(
      read.service.materialize(read.scope, read.cell, cutoff),
    ).rejects.toBe(error);
    expect(read.root.$transaction).toHaveBeenCalledTimes(1);
  });
  it('T7 never retries a fingerprint-shaped P2002 raised outside the baseline CREATE call', async () => {
    const f = await fixture();
    const error = fingerprintError();
    f.hooks.beforeLink = () => {
      throw error;
    };
    await expect(f.service.materialize(f.scope, f.cell, cutoff)).rejects.toBe(
      error,
    );
    expect(f.root.$transaction).toHaveBeenCalledTimes(1);
    expect(f.baselines).toEqual([]);
    expect(f.baselineEdges).toEqual([]);
  });
  it('T8 registers exactly one new provider/export without mounting the application', () => {
    const providers: unknown[] = Reflect.getMetadata(
      'providers',
      ContentLearningCoreModule,
    );
    const exports: unknown[] = Reflect.getMetadata(
      'exports',
      ContentLearningCoreModule,
    );
    expect(
      providers.filter(
        (value) => value === LearningBaselineMaterializationService,
      ),
    ).toHaveLength(1);
    expect(
      exports.filter(
        (value) => value === LearningBaselineMaterializationService,
      ),
    ).toHaveLength(1);
    const params: unknown[] = Reflect.getMetadata(
      'design:paramtypes',
      LearningBaselineMaterializationService,
    );
    expect(params).toEqual([PrismaService, LearningDependencyService]);
    expect(providers).toContain(LearningDependencyService);
    expect(exports).toContain(LearningDependencyService);
  });
});
