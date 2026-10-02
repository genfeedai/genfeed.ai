import { isDeepStrictEqual } from 'node:util';
import {
  buildLearningBaselineMaterialization,
  type LearningBaselineMaterializationProjection,
} from '@api/collections/content-learning/services/learning-baseline-materialization.helper';
import {
  parseLearningMeasurement,
  selectLearningBaseline,
} from '@api/collections/content-learning/services/learning-baseline-selection';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { validLearningCheckpointPublicationV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  LearningCellDescriptor,
  LearningDependencyRefV1,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningBaseline,
  type ContentLearningScopeState,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

type Request = {
  scope: LearningScope;
  descriptor: LearningCellDescriptor;
  cutoff: Date;
};
type Context = {
  account: ContentLearningAccount;
  state: ContentLearningScopeState;
};
type Selection = Awaited<ReturnType<typeof selectLearningBaseline>>;
class FingerprintCreateCollision extends Error {
  constructor(readonly fingerprint: string) {
    super('Baseline fingerprint create collision');
  }
}
function conflict(): never {
  throw new ConflictException('Baseline materialization conflict');
}
function int32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 2147483647;
}
function finiteDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function accountSnapshot(row: ContentLearningAccount): readonly unknown[] {
  return [
    row.id,
    row.organizationId,
    row.brandId,
    row.credentialId,
    row.isDeleted,
    row.mode,
    row.revision,
    row.epoch,
    row.evidenceRevision,
    row.activeConfigVersion,
  ];
}
function scopeSnapshot(row: ContentLearningScopeState): readonly unknown[] {
  return [
    row.id,
    row.organizationId,
    row.brandId,
    row.credentialId,
    row.isDeleted,
    row.scopeKey,
    row.epoch,
    row.revision,
    row.cellDescriptor,
    row.descriptorHash,
  ];
}
function fingerprintCollision(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return false;
  const target = error.meta?.target;
  return (
    (Array.isArray(target) && target.includes('fingerprint')) ||
    target === 'content_learning_baselines_fingerprint_key'
  );
}
@Injectable()
export class LearningBaselineMaterializationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async materialize(
    scope: LearningScope,
    descriptor: LearningCellDescriptor,
    cutoff: Date,
  ): Promise<ContentLearningBaseline | null> {
    const request = this.validateRequest(scope, descriptor, cutoff);
    const options = { maxWait: 5000, timeout: 30000 };
    try {
      return await this.prisma.$transaction(
        (tx) => this.materializeInTransaction(tx, request),
        options,
      );
    } catch (error) {
      if (!(error instanceof FingerprintCreateCollision)) throw error;
      return this.prisma.$transaction(
        (tx) => this.materializeInTransaction(tx, request, error.fingerprint),
        options,
      );
    }
  }
  private validateRequest(
    scope: LearningScope,
    descriptor: LearningCellDescriptor,
    cutoff: Date,
  ): Request {
    buildLearningBaselineMaterialization({
      scope,
      descriptor,
      cutoff,
      epoch: 0,
      evidenceRevision: 0,
      contributors: [],
      samples: [],
    });
    return {
      scope: structuredClone(scope),
      descriptor: structuredClone(descriptor),
      cutoff: new Date(cutoff.getTime()),
    };
  }
  private accountWhere(request: Request, id?: string) {
    return {
      ...(id === undefined ? {} : { id }),
      organizationId: request.scope.organizationId,
      brandId: request.scope.brandId,
      credentialId: request.scope.credentialId,
      isDeleted: false,
    };
  }
  private scopeWhere(request: Request, epoch: number, id?: string) {
    return {
      ...this.accountWhere(request, id),
      scopeKey: learningScopeKey(request.scope),
      epoch,
    };
  }
  private validAccount(row: ContentLearningAccount, request: Request): boolean {
    return (
      !row.isDeleted &&
      row.organizationId === request.scope.organizationId &&
      row.brandId === request.scope.brandId &&
      row.credentialId === request.scope.credentialId &&
      row.mode !== 'disabled' &&
      [row.epoch, row.evidenceRevision, row.revision].every(int32) &&
      row.activeConfigVersion === request.descriptor.configVersion
    );
  }
  private validScope(
    row: ContentLearningScopeState,
    request: Request,
    epoch: number,
  ): boolean {
    return (
      !row.isDeleted &&
      row.organizationId === request.scope.organizationId &&
      row.brandId === request.scope.brandId &&
      row.credentialId === request.scope.credentialId &&
      row.scopeKey === learningScopeKey(request.scope) &&
      row.epoch === epoch &&
      int32(row.revision) &&
      validLearningDescriptor(row.cellDescriptor) &&
      row.descriptorHash ===
        learningHash(learningDescriptorTuple(request.descriptor)) &&
      isDeepStrictEqual(
        learningDescriptorTuple(row.cellDescriptor),
        learningDescriptorTuple(request.descriptor),
      )
    );
  }
  private async liveSources(
    tx: Prisma.TransactionClient,
    request: Request,
  ): Promise<boolean> {
    const { organizationId, brandId, credentialId } = request.scope;
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
    });
    if (
      !organization ||
      organization.id !== organizationId ||
      organization.isDeleted
    )
      return false;
    const brand = await tx.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false, isActive: true },
    });
    if (
      !brand ||
      brand.id !== brandId ||
      brand.organizationId !== organizationId ||
      brand.isDeleted ||
      !brand.isActive
    )
      return false;
    const credential = await tx.credential.findFirst({
      where: {
        id: credentialId,
        organizationId,
        brandId,
        isDeleted: false,
        isConnected: true,
      },
    });
    return (
      credential !== null &&
      credential.id === credentialId &&
      credential.organizationId === organizationId &&
      credential.brandId === brandId &&
      !credential.isDeleted &&
      credential.isConnected &&
      fromPrismaCredentialPlatform(credential.platform) ===
        request.descriptor.platform
    );
  }
  private async readAndLockContext(
    tx: Prisma.TransactionClient,
    request: Request,
  ): Promise<Context | null> {
    const initial = await tx.contentLearningAccount.findFirst({
      where: {
        ...this.accountWhere(request),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (!initial) return null;
    const { organizationId, brandId, credentialId } = request.scope;
    const accountLocks = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM content_learning_accounts WHERE id = ${initial.id} AND "organizationId" = ${organizationId} AND "brandId" = ${brandId} AND "credentialId" = ${credentialId} AND "isDeleted" = false FOR UPDATE`;
    if (accountLocks.length !== 1 || accountLocks[0].id !== initial.id)
      return null;
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        ...this.accountWhere(request, initial.id),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (
      !account ||
      account.id !== initial.id ||
      !this.validAccount(account, request) ||
      !(await this.liveSources(tx, request))
    )
      return null;
    const state = await tx.contentLearningScopeState.findFirst({
      where: {
        ...this.scopeWhere(request, account.epoch),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (!state) return null;
    const scopeKey = learningScopeKey(request.scope),
      epoch = account.epoch;
    const stateLocks = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM content_learning_scope_states WHERE id = ${state.id} AND "organizationId" = ${organizationId} AND "brandId" = ${brandId} AND "credentialId" = ${credentialId} AND "scopeKey" = ${scopeKey} AND epoch = ${epoch} AND "isDeleted" = false FOR UPDATE`;
    if (stateLocks.length !== 1 || stateLocks[0].id !== state.id) return null;
    const currentState = await tx.contentLearningScopeState.findFirst({
      where: {
        ...this.scopeWhere(request, account.epoch, state.id),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (
      !currentState ||
      currentState.id !== state.id ||
      !this.validScope(currentState, request, account.epoch)
    )
      return null;
    return structuredClone({ account, state: currentState });
  }
  private async readCurrentContext(
    tx: Prisma.TransactionClient,
    request: Request,
    context: Context,
  ): Promise<void> {
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        ...this.accountWhere(request, context.account.id),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    const state = await tx.contentLearningScopeState.findFirst({
      where: {
        ...this.scopeWhere(request, context.account.epoch, context.state.id),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (!(await this.liveSources(tx, request))) conflict();
    if (
      !account ||
      !state ||
      !isDeepStrictEqual(
        accountSnapshot(account),
        accountSnapshot(context.account),
      ) ||
      !isDeepStrictEqual(scopeSnapshot(state), scopeSnapshot(context.state))
    )
      conflict();
  }
  private async selectContributors(
    tx: Prisma.TransactionClient,
    request: Request,
    cutoff: Date,
  ): Promise<Selection> {
    const validator = {
      valid: async (
        kind: string,
        id: string,
        client: Prisma.TransactionClient = tx,
        organizationId?: string | null,
      ): Promise<boolean> => {
        if (
          kind !== 'checkpoint' ||
          client !== tx ||
          organizationId !== request.scope.organizationId
        )
          return false;
        const row = await tx.contentLearningCheckpoint.findFirst({
          where: {
            id,
            organizationId: request.scope.organizationId,
            brandId: request.scope.brandId,
            credentialId: request.scope.credentialId,
            isDeleted: false,
          },
        });
        return (
          row !== null &&
          (await validLearningCheckpointPublicationV1(tx, row)) &&
          (await this.dependencies.valid('checkpoint', id, tx, organizationId))
        );
      },
    } satisfies Pick<LearningDependencyService, 'valid'>;
    const selection = await selectLearningBaseline(
      tx,
      request.scope,
      cutoff,
      request.descriptor,
      validator,
    );
    for (const selected of selection.selected) {
      if (
        !(await validLearningCheckpointPublicationV1(tx, selected)) ||
        !(await this.dependencies.valid(
          'checkpoint',
          selected.id,
          tx,
          request.scope.organizationId,
        ))
      )
        conflict();
    }
    return selection;
  }
  private projectMaterialization(
    request: Request,
    context: Context,
    selection: Selection,
    cutoff: Date,
  ): LearningBaselineMaterializationProjection {
    return buildLearningBaselineMaterialization({
      scope: request.scope,
      descriptor: request.descriptor,
      cutoff,
      epoch: context.account.epoch,
      evidenceRevision: context.account.evidenceRevision,
      contributors: selection.selected,
      samples: selection.samples,
    });
  }
  private validateStoredProjection(
    row: ContentLearningBaseline,
    request: Request,
    context: Context,
  ): void {
    if (
      row.isDeleted ||
      row.organizationId !== request.scope.organizationId ||
      row.brandId !== request.scope.brandId ||
      row.credentialId !== request.scope.credentialId ||
      row.scopeKey !== learningScopeKey(request.scope) ||
      row.descriptorHash !== request.scope.rewardProfileId ||
      row.configVersion !== request.descriptor.configVersion ||
      row.snapshotEpoch !== context.account.epoch ||
      row.snapshotEvidenceRevision !== context.account.evidenceRevision ||
      !validLearningDescriptor(row.cellDescriptor) ||
      !isDeepStrictEqual(
        learningDescriptorTuple(row.cellDescriptor),
        learningDescriptorTuple(request.descriptor),
      ) ||
      !finiteDate(row.cutoff) ||
      row.cutoff > request.cutoff ||
      !int32(row.count) ||
      row.count > 50 ||
      !Array.isArray(row.contributorCheckpointIds) ||
      !Array.isArray(row.contributorRevisions) ||
      row.contributorCheckpointIds.length !== row.count ||
      row.contributorRevisions.length !== row.count ||
      new Set(row.contributorCheckpointIds).size !== row.count ||
      row.contributorCheckpointIds.some(
        (id) => typeof id !== 'string' || !id.length || id.trim() !== id,
      ) ||
      !row.contributorRevisions.every(int32) ||
      !Array.isArray(row.samples) ||
      row.samples.length !== row.count ||
      !Number.isFinite(row.medianExposure) ||
      row.validity !== (row.count >= 20 ? 'valid' : 'insufficient_baseline')
    )
      conflict();
    for (const sample of row.samples) {
      const parsed = parseLearningMeasurement(sample);
      if (!parsed || !isDeepStrictEqual(parsed, sample)) conflict();
    }
    if (row.count ? !finiteDate(row.expiresAt) : row.expiresAt !== null)
      conflict();
  }
  private projectionMatches(
    row: ContentLearningBaseline,
    projection: LearningBaselineMaterializationProjection,
    request: Request,
  ): boolean {
    return (
      row.fingerprint === projection.fingerprint &&
      row.scopeKey === projection.scopeKey &&
      row.descriptorHash === projection.descriptorHash &&
      row.configVersion === request.descriptor.configVersion &&
      row.snapshotEpoch === projection.epoch &&
      row.snapshotEvidenceRevision === projection.evidenceRevision &&
      row.cutoff.getTime() === projection.cutoff.getTime() &&
      (row.expiresAt?.getTime() ?? null) ===
        (projection.expiresAt?.getTime() ?? null) &&
      row.count === projection.count &&
      row.medianExposure === projection.medianExposure &&
      isDeepStrictEqual(row.samples, projection.samples) &&
      isDeepStrictEqual(
        row.contributorCheckpointIds,
        projection.contributorCheckpointIds,
      ) &&
      isDeepStrictEqual(
        row.contributorRevisions,
        projection.contributorRevisions,
      )
    );
  }
  private baselineRefs(
    row: ContentLearningBaseline,
    request: Request,
  ): LearningDependencyRefV1[] {
    return [
      ...row.contributorCheckpointIds.map(
        (id, index): LearningDependencyRefV1 => ({
          kind: 'checkpoint',
          id,
          version: String(row.contributorRevisions[index]),
          organizationId: request.scope.organizationId,
        }),
      ),
      {
        kind: 'config',
        id: request.descriptor.configVersion,
        version: request.descriptor.configVersion,
        organizationId: null,
      },
    ];
  }
  private async validateBaselineEdges(
    tx: Prisma.TransactionClient,
    row: ContentLearningBaseline,
    request: Request,
  ): Promise<void> {
    const edges = await tx.contentLearningDependency.findMany({
      where: {
        derivedKind: 'baseline',
        derivedId: row.id,
        derivedOrganizationId: request.scope.organizationId,
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
      take: 52,
    });
    const refs = this.baselineRefs(row, request);
    if (edges.length !== refs.length) conflict();
    for (const edge of edges) {
      if (
        !edge.valid ||
        edge.isDeleted ||
        edge.derivedKind !== 'baseline' ||
        edge.derivedId !== row.id ||
        edge.derivedOrganizationId !== request.scope.organizationId
      )
        conflict();
      const index = refs.findIndex(
        (ref) =>
          ref.kind === edge.sourceKind &&
          ref.id === edge.sourceId &&
          ref.version === edge.sourceVersion &&
          ref.organizationId === edge.sourceOrganizationId,
      );
      if (index < 0) conflict();
      refs.splice(index, 1);
    }
  }
  private async findReusableCandidate(
    tx: Prisma.TransactionClient,
    request: Request,
    context: Context,
  ): Promise<ContentLearningBaseline | null> {
    const row = await tx.contentLearningBaseline.findFirst({
      where: {
        ...this.accountWhere(request),
        organizationId: request.scope.organizationId,
        isDeleted: false,
        scopeKey: learningScopeKey(request.scope),
        descriptorHash: request.scope.rewardProfileId,
        configVersion: request.descriptor.configVersion,
        snapshotEpoch: context.account.epoch,
        snapshotEvidenceRevision: context.account.evidenceRevision,
        validity: { in: ['valid', 'insufficient_baseline'] },
        cutoff: { lte: request.cutoff },
      },
      orderBy: [{ cutoff: 'desc' }, { id: 'desc' }],
    });
    if (!row) return null;
    this.validateStoredProjection(row, request, context);
    if (row.expiresAt && row.expiresAt < request.cutoff) return null;
    const selection = await this.selectContributors(tx, request, row.cutoff);
    const projection = this.projectMaterialization(
      request,
      context,
      selection,
      row.cutoff,
    );
    if (
      !isDeepStrictEqual(
        row.contributorCheckpointIds,
        projection.contributorCheckpointIds,
      ) ||
      !isDeepStrictEqual(
        row.contributorRevisions,
        projection.contributorRevisions,
      )
    )
      return null;
    if (!this.projectionMatches(row, projection, request)) conflict();
    await this.validateBaselineEdges(tx, row, request);
    await this.readCurrentContext(tx, request, context);
    return row;
  }
  private async exactFingerprint(
    tx: Prisma.TransactionClient,
    request: Request,
    context: Context,
    projection: LearningBaselineMaterializationProjection,
  ): Promise<ContentLearningBaseline | null> {
    const row = await tx.contentLearningBaseline.findFirst({
      where: {
        fingerprint: projection.fingerprint,
        ...this.accountWhere(request),
        organizationId: request.scope.organizationId,
        isDeleted: false,
      },
    });
    if (!row) return null;
    this.validateStoredProjection(row, request, context);
    if (!this.projectionMatches(row, projection, request)) conflict();
    await this.validateBaselineEdges(tx, row, request);
    await this.readCurrentContext(tx, request, context);
    return row;
  }
  private async persistMaterialization(
    tx: Prisma.TransactionClient,
    request: Request,
    context: Context,
    projection: LearningBaselineMaterializationProjection,
  ): Promise<ContentLearningBaseline> {
    await this.readCurrentContext(tx, request, context);
    let row: ContentLearningBaseline;
    try {
      row = await tx.contentLearningBaseline.create({
        data: {
          organizationId: request.scope.organizationId,
          brandId: request.scope.brandId,
          credentialId: request.scope.credentialId,
          fingerprint: projection.fingerprint,
          scopeKey: projection.scopeKey,
          descriptorHash: projection.descriptorHash,
          cutoff: projection.cutoff,
          contributorCheckpointIds: projection.contributorCheckpointIds,
          contributorRevisions: projection.contributorRevisions,
          count: projection.count,
          medianExposure: projection.medianExposure,
          samples: toPrismaJson(projection.samples),
          cellDescriptor: toPrismaJson(request.descriptor),
          configVersion: request.descriptor.configVersion,
          snapshotEpoch: projection.epoch,
          snapshotEvidenceRevision: projection.evidenceRevision,
          expiresAt: projection.expiresAt,
          validity: projection.count >= 20 ? 'valid' : 'insufficient_baseline',
        },
      });
    } catch (error) {
      if (fingerprintCollision(error))
        throw new FingerprintCreateCollision(projection.fingerprint);
      throw error;
    }
    this.validateStoredProjection(row, request, context);
    if (!this.projectionMatches(row, projection, request)) conflict();
    const derived: LearningDependencyRefV1 = {
      kind: 'baseline',
      id: row.id,
      version: row.fingerprint,
      organizationId: request.scope.organizationId,
    };
    for (const source of this.baselineRefs(row, request)) {
      const edge = await this.dependencies.link(tx, source, derived);
      if (
        !edge.valid ||
        edge.isDeleted ||
        edge.sourceKind !== source.kind ||
        edge.sourceId !== source.id ||
        edge.sourceOrganizationId !== source.organizationId ||
        edge.sourceVersion !== source.version ||
        edge.derivedKind !== derived.kind ||
        edge.derivedId !== derived.id ||
        edge.derivedOrganizationId !== derived.organizationId
      )
        conflict();
    }
    await this.validateBaselineEdges(tx, row, request);
    await this.readCurrentContext(tx, request, context);
    return row;
  }
  private async materializeInTransaction(
    tx: Prisma.TransactionClient,
    request: Request,
    failedFingerprint?: string,
  ): Promise<ContentLearningBaseline | null> {
    await learningFence(tx, 'shared');
    const context = await this.readAndLockContext(tx, request);
    if (!context) {
      if (failedFingerprint !== undefined) conflict();
      return null;
    }
    if (failedFingerprint === undefined) {
      const reusable = await this.findReusableCandidate(tx, request, context);
      if (reusable) return reusable;
    }
    const selection = await this.selectContributors(
      tx,
      request,
      request.cutoff,
    );
    const projection = this.projectMaterialization(
      request,
      context,
      selection,
      request.cutoff,
    );
    if (
      failedFingerprint !== undefined &&
      projection.fingerprint !== failedFingerprint
    )
      conflict();
    const existing = await this.exactFingerprint(
      tx,
      request,
      context,
      projection,
    );
    if (existing) return existing;
    if (failedFingerprint !== undefined) conflict();
    return this.persistMaterialization(tx, request, context, projection);
  }
}
