import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  ImportedSourceRecord,
  ImportedSourceScope,
} from '@api/collections/imported-sources/services/imported-source-state';
import {
  importedSourceIdentityDigest,
  importedSourceRecaptureId,
  importedSourceRootId,
  importedSourceStateError,
  normalizeImportedSourceInput,
  projectImportedSource,
  readImportedSourceEnvelope,
} from '@api/collections/imported-sources/services/imported-source-state';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type {
  ImportedSourceEnvelope,
  ImportedSourceSnapshotInput,
  ImportedSourceView,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import {
  importedSourceListQuerySchema,
  recaptureImportedSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class ImportedSourcesService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(user: AuthenticatedUser, brandId: string): ImportedSourceScope {
    if (user.isApiKey === true || user.apiKeyId?.trim())
      throw new ForbiddenException({
        code: 'IMPORTED_SOURCE_SESSION_REQUIRED',
        message: 'An interactive session is required.',
      });
    if (
      typeof user.userId !== 'string' ||
      user.userId.trim().length === 0 ||
      !isEntityId(user.organizationId) ||
      !isEntityId(brandId)
    )
      throw new BadRequestException({
        code: 'IMPORTED_SOURCE_SCOPE_INVALID',
        message: 'Invalid imported source scope.',
      });
    return {
      userId: user.userId,
      organizationId: user.organizationId,
      brandId,
    };
  }
  private async requireBrand(
    db: PrismaService | Prisma.TransactionClient,
    scope: ImportedSourceScope,
  ) {
    const brand = await db.brand.findFirst({
      where: {
        id: scope.brandId,
        organizationId: scope.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!brand) throw new NotFoundException({ message: 'Brand not found.' });
  }
  private sourceActionId(digest: string) {
    return `imported-source:v1:${digest}`;
  }
  private async active(
    db: PrismaService | Prisma.TransactionClient,
    scope: ImportedSourceScope,
    digest: string,
  ) {
    const rows = await db.ingredient.findMany({
      where: {
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        category: 'TEXT',
        sourceActionId: this.sourceActionId(digest),
        isDeleted: false,
      },
      take: 2,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (rows.length > 1)
      throw importedSourceStateError('IMPORTED_SOURCE_DUPLICATE_CONFLICT');
    if (!rows[0]) return null;
    if (readImportedSourceEnvelope(rows[0]).identityDigest !== digest)
      throw importedSourceStateError();
    return rows[0];
  }
  private async create(
    db: Prisma.TransactionClient,
    scope: ImportedSourceScope,
    id: string,
    envelope: ImportedSourceEnvelope,
  ) {
    return db.ingredient.create({
      data: {
        id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        userId: scope.userId,
        category: 'TEXT',
        status: 'DRAFT',
        scope: 'USER',
        version: envelope.captureRevision,
        isDeleted: false,
        isPublic: false,
        sourceActionId: this.sourceActionId(envelope.identityDigest),
        providerData: toPrismaJson({ importedSource: envelope }),
      },
    });
  }
  private snapshot(input: ImportedSourceSnapshotInput) {
    return {
      ...input,
      capturedAt: new Date().toISOString(),
      captureSurface: 'extension' as const,
      provenance: 'imported' as const,
      evidenceAuthority: 'client_reported' as const,
      host: new URL(input.canonicalUrl).hostname,
    };
  }
  async save(
    user: AuthenticatedUser,
    brandId: string,
    input: unknown,
  ): Promise<ImportedSourceView> {
    const scope = this.scope(user, brandId);
    const snapshot = normalizeImportedSourceInput(input);
    const digest = importedSourceIdentityDigest(scope, snapshot);
    const id = importedSourceRootId(digest);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${this.sourceActionId(digest)}, 0))::text`;
          await this.requireBrand(tx, scope);
          const active = await this.active(tx, scope, digest);
          if (active) return projectImportedSource(active, true);
          const deleted = await tx.ingredient.findFirst({
            where: {
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              category: 'TEXT',
              sourceActionId: this.sourceActionId(digest),
              isDeleted: true,
            },
            orderBy: [{ version: 'desc' }, { id: 'desc' }],
          });
          if (deleted)
            throw importedSourceStateError('IMPORTED_SOURCE_DELETED', {
              deletedIngredientId: deleted.id,
              message: 'Source was deleted. Use its explicit recapture route.',
            });
          const envelope: ImportedSourceEnvelope = {
            version: 1,
            identityDigest: digest,
            originIngredientId: id,
            captureRevision: 1,
            snapshot: this.snapshot(snapshot),
          };
          return projectImportedSource(
            await this.create(tx, scope, id, envelope),
          );
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      return this.transactionFailure(error, scope, id, digest);
    }
  }
  async get(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
  ): Promise<ImportedSourceView> {
    const scope = this.scope(user, brandId);
    this.requireId(id);
    await this.requireBrand(this.prisma, scope);
    const record = await this.prisma.ingredient.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        category: 'TEXT',
        sourceActionId: { startsWith: 'imported-source:v1:' },
        isDeleted: false,
      },
    });
    if (!record)
      throw new NotFoundException({ message: 'Imported source not found.' });
    return projectImportedSource(record);
  }
  async list(
    user: AuthenticatedUser,
    brandId: string,
    query: unknown,
  ): Promise<AggregatePaginateResult<ImportedSourceView>> {
    const scope = this.scope(user, brandId);
    const parsed = importedSourceListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'IMPORTED_SOURCE_QUERY_INVALID',
        message: 'Invalid imported source query.',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    await this.requireBrand(this.prisma, scope);
    const { page, limit } = parsed.data;
    const where = {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      isDeleted: false,
      category: 'TEXT' as const,
      sourceActionId: { startsWith: 'imported-source:v1:' },
    };
    const [records, totalDocs] = await Promise.all([
      this.prisma.ingredient.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ingredient.count({ where }),
    ]);
    const hasPrevPage = page > 1;
    const hasNextPage = page * limit < totalDocs;
    return {
      docs: records.map((row) => projectImportedSource(row)),
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
      pagingCounter: (page - 1) * limit + 1,
      hasPrevPage,
      hasNextPage,
      prevPage: hasPrevPage ? page - 1 : null,
      nextPage: hasNextPage ? page + 1 : null,
    };
  }
  private requireId(id: string) {
    if (!isEntityId(id))
      throw new BadRequestException({
        code: 'IMPORTED_SOURCE_ID_INVALID',
        message: 'Invalid imported source identifier.',
      });
  }
  private async deleted(
    db: PrismaService | Prisma.TransactionClient,
    scope: ImportedSourceScope,
    id: string,
  ): Promise<ImportedSourceRecord> {
    const row = await db.ingredient.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        category: 'TEXT',
        isDeleted: true,
      },
    });
    if (!row)
      throw new NotFoundException({
        message: 'Deleted imported source not found.',
      });
    readImportedSourceEnvelope(row);
    return row;
  }
  async recapture(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
    input: unknown,
  ): Promise<ImportedSourceView> {
    const scope = this.scope(user, brandId);
    this.requireId(id);
    const parsed = recaptureImportedSourceSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'IMPORTED_SOURCE_RECAPTURE_INVALID',
        message: 'Invalid recapture request.',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    const original = readImportedSourceEnvelope(
      await this.deleted(this.prisma, scope, id),
    );
    const nextId = importedSourceRecaptureId(scope, id, parsed.data.requestId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${this.sourceActionId(original.identityDigest)}, 0))::text`;
          await this.requireBrand(tx, scope);
          const reread = readImportedSourceEnvelope(
            await this.deleted(tx, scope, id),
          );
          if (reread.identityDigest !== original.identityDigest)
            throw importedSourceStateError();
          const active = await this.active(tx, scope, original.identityDigest);
          if (active) return projectImportedSource(active, true);
          const replay = await this.checkRecaptureId(
            tx,
            scope,
            nextId,
            original.identityDigest,
            id,
            parsed.data.requestId,
          );
          if (replay) return projectImportedSource(replay, true);
          const revision = await this.nextVersion(
            tx,
            scope,
            original.identityDigest,
          );
          const envelope: ImportedSourceEnvelope = {
            ...reread,
            captureRevision: revision,
            snapshot: {
              ...reread.snapshot,
              capturedAt: new Date().toISOString(),
            },
            recapturedFromIngredientId: id,
            recaptureRequestId: parsed.data.requestId,
          };
          return projectImportedSource(
            await this.create(tx, scope, nextId, envelope),
          );
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      return this.transactionFailure(
        error,
        scope,
        nextId,
        original.identityDigest,
        parsed.data.requestId,
        id,
      );
    }
  }
  private async checkRecaptureId(
    tx: Prisma.TransactionClient,
    scope: ImportedSourceScope,
    id: string,
    digest: string,
    predecessor: string,
    requestId: string,
  ) {
    const active = await tx.ingredient.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
    if (active) {
      this.matchRecapture(active, digest, predecessor, requestId);
      return active;
    }
    const deleted = await tx.ingredient.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: true,
      },
    });
    if (deleted) {
      this.matchRecapture(deleted, digest, predecessor, requestId);
      throw importedSourceStateError(
        'IMPORTED_SOURCE_RECAPTURE_REQUEST_RETIRED',
      );
    }
    return null;
  }
  private matchRecapture(
    row: ImportedSourceRecord,
    digest: string,
    predecessor: string,
    requestId: string,
  ) {
    const envelope = readImportedSourceEnvelope(row);
    if (
      envelope.identityDigest !== digest ||
      envelope.recapturedFromIngredientId !== predecessor ||
      envelope.recaptureRequestId !== requestId
    )
      throw importedSourceStateError('IMPORTED_SOURCE_ID_CONFLICT');
  }
  private async nextVersion(
    tx: Prisma.TransactionClient,
    scope: ImportedSourceScope,
    digest: string,
  ): Promise<number> {
    const [active, deleted] = await Promise.all([
      tx.ingredient.aggregate({
        _max: { version: true },
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          category: 'TEXT',
          sourceActionId: this.sourceActionId(digest),
          isDeleted: false,
        },
      }),
      tx.ingredient.aggregate({
        _max: { version: true },
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          category: 'TEXT',
          sourceActionId: this.sourceActionId(digest),
          isDeleted: true,
        },
      }),
    ]);
    const max = Math.max(active._max.version ?? 0, deleted._max.version ?? 0);
    if (!Number.isSafeInteger(max) || max < 0 || max >= 2147483647)
      throw importedSourceStateError();
    return max + 1;
  }
  private async transactionFailure(
    error: unknown,
    scope: ImportedSourceScope,
    id: string,
    digest: string,
    requestId?: string,
    predecessor?: string,
  ): Promise<ImportedSourceView> {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
    if (code === 'P2002') {
      const row = await this.prisma.ingredient.findFirst({
        where: {
          id,
          sourceActionId: this.sourceActionId(digest),
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          category: 'TEXT',
          isDeleted: false,
        },
      });
      if (!row) throw importedSourceStateError('IMPORTED_SOURCE_ID_CONFLICT');
      try {
        if (requestId && predecessor)
          this.matchRecapture(row, digest, predecessor, requestId);
        if (readImportedSourceEnvelope(row).identityDigest !== digest)
          throw importedSourceStateError();
        return projectImportedSource(row, true);
      } catch {
        throw importedSourceStateError('IMPORTED_SOURCE_ID_CONFLICT');
      }
    }
    if (['P2028', 'P2034', 'P1008', 'P2024'].includes(String(code)))
      throw new ServiceUnavailableException({
        code: 'IMPORTED_SOURCE_RETRYABLE',
        message: 'Imported source could not be saved. Retry the request.',
      });
    throw error;
  }
}
