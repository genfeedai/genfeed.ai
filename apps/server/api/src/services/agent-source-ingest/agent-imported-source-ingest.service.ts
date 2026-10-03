import { readImportedSourceEnvelope } from '@api/collections/imported-sources/services/imported-source-state';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  assertSourceCaptureAttemptMatch,
  createSourceCaptureIngest,
  importedSourceMediaId,
  importedSourceMediaUrlDigest,
  mergeImportedSourceMediaBinding,
  mergeSourceCaptureIngest,
  parseImportedSourceMediaBinding,
  parseSourceCaptureIngest,
  projectImportedSourceMediaView,
  sourceCaptureLeaseExpired,
} from '@api/services/agent-source-ingest/agent-imported-source-ingest.state';
import {
  AgentSourceDownloadService,
  AgentSourceExtractionFailedError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type {
  AgentImportedMediaRecord,
  AgentImportedSourceAttemptState,
  AgentImportedSourceClaim,
  AgentImportedSourceCompletionOutcome,
  AgentImportedSourceIngestInput,
  AgentImportedSourceIngestScope,
  AgentImportedSourceState,
  AgentSourceArtifact,
  SourceCaptureIngest,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ImportedSourceMediaBinding,
  ImportedSourceMediaView,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import {
  importedSourceMediaRetrySchema,
  importedSourceMediaStartSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type { Prisma } from '@genfeedai/prisma';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AgentImportedSourceIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly downloader: AgentSourceDownloadService,
  ) {}
  private conflict(): ConflictException {
    return new ConflictException({
      code: 'SOURCE_MEDIA_CHANGED',
      message: 'Imported source media changed. Reload its current state.',
    });
  }
  private async requireSource(
    db: PrismaService | Prisma.TransactionClient,
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<AgentImportedSourceState> {
    if (
      !isEntityId(scope.organizationId) ||
      !isEntityId(scope.brandId) ||
      typeof scope.userId !== 'string' ||
      !scope.userId.trim() ||
      !isEntityId(input.sourceId)
    )
      throw new BadRequestException('Invalid imported source media scope.');
    const brand = await db.brand.findFirst({
      where: {
        id: scope.brandId,
        organizationId: scope.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
    const source = await db.ingredient.findFirst({
      where: {
        id: input.sourceId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
        category: IngredientCategory.TEXT,
      },
    });
    if (!brand || !source)
      throw new NotFoundException({ message: 'Imported source not found.' });
    const envelope = readImportedSourceEnvelope(source);
    if (
      envelope.identityDigest !== input.sourceIdentityDigest ||
      source.version !== input.sourceRecordVersion ||
      envelope.snapshot.title !== input.title ||
      JSON.stringify(
        envelope.snapshot.selectedMedia
          ? [
              envelope.snapshot.selectedMedia.kind,
              envelope.snapshot.selectedMedia.url,
              envelope.snapshot.selectedMedia.availability,
            ]
          : null,
      ) !==
        JSON.stringify(
          input.selectedMedia
            ? [
                input.selectedMedia.kind,
                input.selectedMedia.url,
                input.selectedMedia.availability,
              ]
            : null,
        )
    )
      throw this.conflict();
    const binding = parseImportedSourceMediaBinding(source.providerData);
    if (
      binding &&
      (!envelope.snapshot.selectedMedia ||
        ['embed_only', 'unavailable'].includes(
          envelope.snapshot.selectedMedia.availability,
        ) ||
        binding.sourceIdentityDigest !== envelope.identityDigest ||
        binding.sourceRecordVersion !== source.version ||
        binding.mediaKind !== envelope.snapshot.selectedMedia.kind ||
        binding.mediaIngredientId !==
          importedSourceMediaId(
            scope,
            source.id,
            envelope.identityDigest,
            binding.mediaKind,
            binding.mediaUrlDigest,
          ))
    )
      throw this.conflict();
    return { source, envelope, binding };
  }
  private async requireMedia(
    db: PrismaService | Prisma.TransactionClient,
    state: AgentImportedSourceState,
    scope: AgentImportedSourceIngestScope,
  ): Promise<AgentImportedSourceState> {
    if (!state.binding) return state;
    const media = await db.ingredient.findFirst({
      where: {
        id: state.binding.mediaIngredientId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
    if (!media) return state;
    const next = {
      ...state,
      media,
      ingest: parseSourceCaptureIngest(media.providerData),
    };
    this.projectView(next, scope);
    return next;
  }
  private async requireState(
    db: PrismaService | Prisma.TransactionClient,
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<AgentImportedSourceState> {
    const source = await this.requireSource(db, input, scope);
    return this.requireMedia(db, source, scope);
  }
  private projectView(
    state: AgentImportedSourceState,
    scope: AgentImportedSourceIngestScope,
    unavailable = false,
  ): ImportedSourceMediaView {
    return projectImportedSourceMediaView({
      sourceId: state.source.id,
      sourceRecordVersion: state.source.version,
      sourceIdentityDigest: state.envelope.identityDigest,
      scope,
      binding: state.binding,
      media: state.media,
      ingest: state.ingest,
      unavailable,
    });
  }
  private unavailable(
    state: AgentImportedSourceState,
    scope: AgentImportedSourceIngestScope,
  ): ImportedSourceMediaView {
    return this.projectView(state, scope, true);
  }
  private async claimInitial(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    url: string,
  ): Promise<AgentImportedSourceClaim> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`imported-source:v1:${input.sourceIdentityDigest}`}, 0))::text`;
          const state = await this.requireState(tx, input, scope);
          if (state.binding) return { state, claimed: false };
          const selection = state.envelope.snapshot.selectedMedia;
          if (
            !selection ||
            ['embed_only', 'unavailable'].includes(selection.availability)
          )
            throw this.conflict();
          const mediaUrlDigest = importedSourceMediaUrlDigest(url);
          const mediaIngredientId = importedSourceMediaId(
            scope,
            input.sourceId,
            input.sourceIdentityDigest,
            selection.kind,
            mediaUrlDigest,
          );
          const binding: ImportedSourceMediaBinding = {
            version: 1,
            sourceIdentityDigest: input.sourceIdentityDigest,
            sourceRecordVersion: input.sourceRecordVersion,
            mediaIngredientId,
            mediaKind: selection.kind,
            mediaUrlDigest,
            bindingRevision: 1,
            selectedAt: new Date().toISOString(),
            selectedByUserId: scope.userId,
          };
          const ingest = createSourceCaptureIngest(
            input,
            scope,
            binding,
            1,
            binding.selectedAt,
          );
          const media = await tx.ingredient.create({
            data: {
              id: mediaIngredientId,
              organization: { connect: { id: scope.organizationId } },
              brand: { connect: { id: scope.brandId } },
              user: { connect: { id: scope.userId } },
              category:
                selection.kind === 'image'
                  ? IngredientCategory.IMAGE
                  : selection.kind === 'audio'
                    ? IngredientCategory.AUDIO
                    : IngredientCategory.VIDEO,
              scope: AssetScope.USER,
              status: IngredientStatus.PROCESSING,
              version: 1,
              isDeleted: false,
              isPublic: false,
              sourceActionId: `imported-source-media:v1:${mediaIngredientId.slice(1)}`,
              providerData: mergeSourceCaptureIngest(null, ingest),
              metadata: {
                create: {
                  label: state.envelope.snapshot.title.slice(0, 200),
                  extension:
                    selection.kind === 'image'
                      ? MetadataExtension.JPEG
                      : selection.kind === 'audio'
                        ? MetadataExtension.MP3
                        : MetadataExtension.MP4,
                  isDeleted: false,
                },
              },
            },
          });
          const changed = await tx.ingredient.updateMany({
            where: {
              id: state.source.id,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              isDeleted: false,
              version: state.source.version,
              providerData: { equals: toPrismaJson(state.source.providerData) },
            },
            data: {
              providerData: mergeImportedSourceMediaBinding(
                state.source.providerData,
                binding,
              ),
            },
          });
          if (changed.count !== 1) throw this.conflict();
          return { state: { ...state, binding, media, ingest }, claimed: true };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (
        typeof error !== 'object' ||
        !error ||
        !('code' in error) ||
        error.code !== 'P2002'
      )
        throw error;
      const state = await this.requireState(this.prisma, input, scope);
      if (
        !state.binding ||
        !state.media ||
        state.binding.mediaUrlDigest !== importedSourceMediaUrlDigest(url)
      )
        throw this.conflict();
      return { state, claimed: false };
    }
  }
  private async updateAttempt(
    tx: Prisma.TransactionClient,
    state: AgentImportedSourceState,
    scope: AgentImportedSourceIngestScope,
    next: SourceCaptureIngest,
    data: Prisma.IngredientUpdateManyMutationInput = {},
  ): Promise<AgentImportedSourceState> {
    if (!state.media || !state.ingest) throw this.conflict();
    const providerData = mergeSourceCaptureIngest(
      state.media.providerData,
      next,
    );
    const changed = await tx.ingredient.updateMany({
      where: {
        id: state.media.id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
        status: state.media.status,
        version: state.ingest.ingestRevision,
        providerData: { equals: toPrismaJson(state.media.providerData) },
      },
      data: { ...data, providerData },
    });
    if (changed.count !== 1) throw this.conflict();
    return this.requireMedia(
      tx,
      { ...state, media: undefined, ingest: undefined },
      scope,
    );
  }
  private sameAttempt(
    state: AgentImportedSourceState,
    attempt: SourceCaptureIngest,
  ): asserts state is AgentImportedSourceAttemptState {
    if (!state.binding || !state.media || !state.ingest) throw this.conflict();
    assertSourceCaptureAttemptMatch(state.ingest, attempt);
  }
  private async persistQueued(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    attempt: SourceCaptureIngest,
    jobId: string,
  ): Promise<void> {
    if (jobId !== `agent-source-${attempt.storageId}`) throw this.conflict();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`imported-source:v1:${input.sourceIdentityDigest}`}, 0))::text`;
        const state = await this.requireState(tx, input, scope);
        this.sameAttempt(state, attempt);
        if (sourceCaptureLeaseExpired(attempt)) throw this.conflict();
        await this.updateAttempt(
          tx,
          state,
          scope,
          { ...attempt, state: 'submitted', jobId },
          { generationStage: `source-job:${jobId}` },
        );
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
    );
  }
  private async lockActiveSourceForCompletion(
    tx: Prisma.TransactionClient,
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<
      Array<Pick<AgentImportedMediaRecord, 'id'>>
    >`
      SELECT "id" FROM "ingredients" WHERE "id" = ${input.sourceId}
      AND "organizationId" = ${scope.organizationId} AND "brandId" = ${scope.brandId}
      AND "category" = 'TEXT' AND "isDeleted" = false FOR UPDATE`;
    if (rows.length > 1) throw this.conflict();
    return rows.length === 1;
  }
  private async failDeletedSourceAttempt(
    tx: Prisma.TransactionClient,
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    attempt: SourceCaptureIngest,
    binding: ImportedSourceMediaBinding,
  ): Promise<void> {
    const media = await tx.ingredient.findFirst({
      where: {
        id: binding.mediaIngredientId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
    if (!media) throw this.conflict();
    const ingest = parseSourceCaptureIngest(media.providerData);
    projectImportedSourceMediaView({
      sourceId: input.sourceId,
      sourceRecordVersion: input.sourceRecordVersion,
      sourceIdentityDigest: input.sourceIdentityDigest,
      scope,
      binding,
      media,
      ingest,
    });
    assertSourceCaptureAttemptMatch(ingest, attempt);
    const changed = await tx.ingredient.updateMany({
      where: {
        id: media.id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
        status: media.status,
        version: ingest.ingestRevision,
        providerData: { equals: toPrismaJson(media.providerData) },
      },
      data: {
        status: IngredientStatus.FAILED,
        providerData: mergeSourceCaptureIngest(media.providerData, {
          ...ingest,
          state: 'failed',
          errorCode: 'SOURCE_MEDIA_FAILED',
        }),
      },
    });
    if (changed.count !== 1) throw this.conflict();
  }
  private async finalizeArtifact(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    attempt: SourceCaptureIngest,
    artifact: AgentSourceArtifact,
    knownState: AgentImportedSourceState,
  ): Promise<AgentImportedSourceState> {
    if (
      !knownState.binding ||
      knownState.source.id !== input.sourceId ||
      knownState.source.version !== input.sourceRecordVersion ||
      knownState.envelope.identityDigest !== input.sourceIdentityDigest
    )
      throw this.conflict();
    const binding = knownState.binding;
    const folder = { image: 'images', video: 'videos', audio: 'audios' }[
      attempt.mediaKind
    ];
    if (
      artifact.kind !== attempt.mediaKind ||
      artifact.storageKey !== `ingredients/${folder}/${attempt.storageId}` ||
      [artifact.width, artifact.height, artifact.duration, artifact.size].some(
        (v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0,
      )
    )
      throw new BadRequestException(
        'Source media did not return the expected durable artifact.',
      );
    const outcome =
      await this.prisma.$transaction<AgentImportedSourceCompletionOutcome>(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`imported-source:v1:${input.sourceIdentityDigest}`}, 0))::text`;
          if (!(await this.lockActiveSourceForCompletion(tx, input, scope))) {
            await this.failDeletedSourceAttempt(
              tx,
              input,
              scope,
              attempt,
              binding,
            );
            return { kind: 'source_missing' };
          }
          const state = await this.requireState(tx, input, scope);
          this.sameAttempt(state, attempt);
          const next = await this.updateAttempt(
            tx,
            state,
            scope,
            { ...state.ingest, state: 'ready', errorCode: undefined },
            {
              status: IngredientStatus.UPLOADED,
              s3Key: artifact.storageKey,
              fileSize: Math.round(artifact.size),
              generationError: null,
            },
          );
          await tx.ingredient.update({
            where: {
              id: state.media.id,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              isDeleted: false,
              version: attempt.ingestRevision,
            },
            data: {
              metadata: {
                update: {
                  extension: artifact.extension,
                  width: Math.round(artifact.width),
                  height: Math.round(artifact.height),
                  duration: artifact.duration,
                  size: Math.round(artifact.size),
                  hasAudio: artifact.hasAudio,
                },
              },
            },
          });
          return { kind: 'ready', state: next };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
      );
    if (outcome.kind === 'source_missing')
      throw new NotFoundException({ message: 'Imported source not found.' });
    return outcome.state;
  }
  private async recordAttemptFailure(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    attempt: SourceCaptureIngest,
    failed: boolean,
  ): Promise<AgentImportedSourceState> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`imported-source:v1:${input.sourceIdentityDigest}`}, 0))::text`;
        const state = await this.requireState(tx, input, scope);
        this.sameAttempt(state, attempt);
        return this.updateAttempt(
          tx,
          state,
          scope,
          {
            ...state.ingest,
            state: failed ? 'failed' : 'uncertain',
            errorCode: failed
              ? 'SOURCE_MEDIA_FAILED'
              : 'SOURCE_MEDIA_UNCERTAIN',
          },
          {
            status: failed
              ? IngredientStatus.FAILED
              : IngredientStatus.PROCESSING,
          },
        );
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
    );
  }
  private async claimRetry(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    url: string,
  ): Promise<AgentImportedSourceClaim> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`imported-source:v1:${input.sourceIdentityDigest}`}, 0))::text`;
        const state = await this.requireState(tx, input, scope);
        if (!state.media || !state.ingest || !state.binding)
          throw new NotFoundException({
            message: 'Bound source media not found.',
          });
        if (
          state.ingest.requestId === input.requestId &&
          state.ingest.retryFromRevision === input.expectedIngestRevision
        )
          return { state, claimed: false };
        if (
          state.ingest.ingestRevision !== input.expectedIngestRevision ||
          !this.projectView(state, scope).canRetry ||
          importedSourceMediaUrlDigest(url) !== state.binding.mediaUrlDigest ||
          state.media.version >= 2147483647
        )
          throw this.conflict();
        const startedAt = new Date().toISOString();
        const ingest = createSourceCaptureIngest(
          input,
          scope,
          state.binding,
          state.media.version + 1,
          startedAt,
          state.media.version,
        );
        const next = await this.updateAttempt(tx, state, scope, ingest, {
          version: ingest.ingestRevision,
          status: IngredientStatus.PROCESSING,
          generationStage: null,
          generationError: null,
        });
        return { state: next, claimed: true };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
    );
  }
  private validateRequest(
    input: AgentImportedSourceIngestInput,
    retry: boolean,
  ): AgentImportedSourceIngestInput {
    const parsed = retry
      ? importedSourceMediaRetrySchema.safeParse({
          requestId: input.requestId,
          expectedIngestRevision: input.expectedIngestRevision,
        })
      : importedSourceMediaStartSchema.safeParse({
          requestId: input.requestId,
        });
    if (!parsed.success)
      throw new BadRequestException({
        code: 'SOURCE_MEDIA_REQUEST_INVALID',
        message: 'Invalid source media request.',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    return { ...input, ...parsed.data };
  }
  private async runAttempt(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
    claim: AgentImportedSourceClaim,
    url: string,
  ): Promise<ImportedSourceMediaView> {
    const attempt = claim.state.ingest;
    if (!attempt || !claim.state.binding) throw this.conflict();
    try {
      const state = await this.requireState(this.prisma, input, scope);
      this.sameAttempt(state, attempt);
      if (sourceCaptureLeaseExpired(attempt)) throw this.conflict();
      const artifact = await this.downloader.download(
        url,
        attempt.storageId,
        attempt.mediaKind,
        { organizationId: scope.organizationId, userId: attempt.actorUserId },
        undefined,
        (jobId) => this.persistQueued(input, scope, attempt, jobId),
        { requeueMissingJob: false, requireJobIdentity: true },
      );
      return this.projectView(
        await this.finalizeArtifact(
          input,
          scope,
          attempt,
          artifact,
          claim.state,
        ),
        scope,
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw error;
      const failed =
        error instanceof BadRequestException ||
        error instanceof AgentSourceExtractionFailedError;
      return this.projectView(
        await this.recordAttemptFailure(input, scope, attempt, failed),
        scope,
      );
    }
  }
  async start(
    raw: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<ImportedSourceMediaView> {
    const state = await this.requireState(this.prisma, raw, scope);
    const input = this.validateRequest(raw, false);
    if (state.binding) return this.observe(input, scope);
    const selection = state.envelope.snapshot.selectedMedia;
    if (
      !selection ||
      ['embed_only', 'unavailable'].includes(selection.availability)
    )
      return this.unavailable(state, scope);
    let url: string;
    try {
      url = await this.downloader.normalizeUrl(selection.url);
    } catch {
      return this.unavailable(state, scope);
    }
    const claim = await this.claimInitial(input, scope, url);
    if (!claim.claimed) return this.observe(input, scope);
    return this.runAttempt(input, scope, claim, url);
  }
  async observe(
    input: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<ImportedSourceMediaView> {
    const state = await this.requireState(this.prisma, input, scope);
    if (!state.binding)
      return !state.envelope.snapshot.selectedMedia ||
        ['embed_only', 'unavailable'].includes(
          state.envelope.snapshot.selectedMedia.availability,
        )
        ? this.unavailable(state, scope)
        : this.projectView(state, scope);
    if (!state.media || !state.ingest) return this.unavailable(state, scope);
    if (['ready', 'failed'].includes(state.ingest.state))
      return this.projectView(state, scope);
    if (state.ingest.jobId) {
      let url: string;
      try {
        url = await this.downloader.normalizeUrl(
          state.envelope.snapshot.selectedMedia?.url ?? '',
        );
      } catch {
        return this.projectView(
          await this.recordAttemptFailure(input, scope, state.ingest, false),
          scope,
        );
      }
      if (importedSourceMediaUrlDigest(url) !== state.binding.mediaUrlDigest)
        throw this.conflict();
      const current = await this.requireState(this.prisma, input, scope);
      this.sameAttempt(current, state.ingest);
      const observation = await this.downloader.observeQueuedSource(
        state.ingest.storageId,
        state.ingest.jobId,
        {
          organizationId: scope.organizationId,
          userId: state.ingest.actorUserId,
        },
        url,
      );
      if (observation.state === 'ready')
        return this.projectView(
          await this.finalizeArtifact(
            input,
            scope,
            state.ingest,
            observation.artifact,
            state,
          ),
          scope,
        );
      if (observation.state === 'failed')
        return this.projectView(
          await this.recordAttemptFailure(input, scope, state.ingest, true),
          scope,
        );
      if (observation.state === 'pending')
        return {
          ...this.projectView(state, scope),
          state: 'processing',
          canRetry: false,
          errorCode: undefined,
        };
      return this.projectView(
        await this.recordAttemptFailure(input, scope, state.ingest, false),
        scope,
      );
    }
    if (
      sourceCaptureLeaseExpired(state.ingest) &&
      state.ingest.state !== 'uncertain'
    )
      return this.projectView(
        await this.recordAttemptFailure(input, scope, state.ingest, false),
        scope,
      );
    return this.projectView(state, scope);
  }
  async retry(
    raw: AgentImportedSourceIngestInput,
    scope: AgentImportedSourceIngestScope,
  ): Promise<ImportedSourceMediaView> {
    let state = await this.requireState(this.prisma, raw, scope);
    const input = this.validateRequest(raw, true);
    if (!state.binding) throw this.conflict();
    if (!state.media || !state.ingest)
      throw new NotFoundException({ message: 'Bound source media not found.' });
    if (
      state.ingest.requestId === input.requestId &&
      state.ingest.retryFromRevision === input.expectedIngestRevision
    )
      return this.observe(input, scope);
    if (state.ingest.ingestRevision !== input.expectedIngestRevision)
      throw this.conflict();
    const observed = await this.observe(input, scope);
    if (!observed.canRetry) throw this.conflict();
    state = await this.requireState(this.prisma, input, scope);
    let url: string;
    try {
      url = await this.downloader.normalizeUrl(
        state.envelope.snapshot.selectedMedia?.url ?? '',
      );
    } catch {
      return this.unavailable(state, scope);
    }
    if (importedSourceMediaUrlDigest(url) !== state.binding?.mediaUrlDigest)
      throw this.conflict();
    const claim = await this.claimRetry(input, scope, url);
    return claim.claimed
      ? this.runAttempt(input, scope, claim, url)
      : this.observe(input, scope);
  }
}
