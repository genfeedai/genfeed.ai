import { randomUUID } from 'node:crypto';
import { MAX_SERIALIZATION_RETRIES } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import {
  CHARACTER_JOURNAL_CAPACITY,
  CHARACTER_LEASE_MS,
  type CharacterOperation,
  characterObservation,
  characterReceipt,
  characterStructuralAssociation,
} from '@api/collections/content-runs/services/storyboard-character-replace-state';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import type { StoryboardStoredRunConfig } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { HIGGSFIELD_GENJUTSU_DEFAULT_RESOLUTION } from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetScope, IngredientStatus } from '@genfeedai/contracts';
import {
  replaceStoryboardCharacterSchema,
  STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
  type StoryboardCharacterReplacement,
  storyboardCharacterReplacementSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { Prisma } from '@genfeedai/prisma';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class StoryboardCharacterReplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly source: StoryboardSourceService,
    private readonly videos: BrandRemixSceneSourceService,
    private readonly higgsField: HiggsFieldService,
    private readonly mediaUrls: MediaUrlService,
  ) {}
  private async read(org: string, brand: string, run: string) {
    return (await this.store.read(org, brand, run)).config;
  }
  private async conflict(
    op: CharacterOperation,
    config: StoryboardStoredRunConfig,
    code: string,
  ): Promise<never> {
    throw new ConflictException({
      ...characterReceipt(
        op,
        await this.current(op.organizationId, op.brandId, config, op),
      ),
      errorCode: code,
    });
  }
  private async mutate(
    org: string,
    brand: string,
    run: string,
    change: (
      config: StoryboardStoredRunConfig,
    ) => StoryboardStoredRunConfig | Promise<StoryboardStoredRunConfig>,
  ): Promise<StoryboardStoredRunConfig> {
    for (let i = 0; i < MAX_SERIALIZATION_RETRIES; i++) {
      const current = await this.read(org, brand, run);
      const next = await change(current);
      try {
        await this.store.save(org, brand, run, current, next);
        return next;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    throw new ConflictException(
      'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
    );
  }
  private async versions(
    org: string,
    brand: string,
    ids: readonly string[],
    category: 'IMAGE' | 'VIDEO',
  ) {
    const where: Prisma.IngredientWhereInput = scopedWhere(org, {
      brandId: brand,
      id: { in: [...ids] },
      category,
      scope: AssetScope.USER,
      status: {
        in: [
          IngredientStatus.UPLOADED,
          IngredientStatus.GENERATED,
          IngredientStatus.VALIDATED,
        ],
      },
    } satisfies Prisma.IngredientWhereInput);
    const rows = await this.prisma.ingredient.findMany({ where });
    return ids.map((id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new NotFoundException('Storyboard character media', id);
      if (!row.updatedAt)
        throw new ConflictException(
          'CHARACTER_REPLACEMENT_ASSET_VERSION_MISSING',
        );
      return {
        id,
        updatedAt: row.updatedAt.toISOString(),
        url:
          readIngredientMediaUrl(row) ??
          (row.s3Key ? this.mediaUrls.buildUrl(row.s3Key) : undefined),
      };
    });
  }
  private async current(
    org: string,
    brand: string,
    config: StoryboardStoredRunConfig,
    op: CharacterOperation,
  ): Promise<boolean> {
    if (!characterStructuralAssociation(config, op)) return false;
    if (op.legacy) return false;
    try {
      const source = await this.versions(
        org,
        brand,
        [op.videoAssetId],
        'VIDEO',
      );
      const refs = await this.versions(org, brand, op.imageAssetIds, 'IMAGE');
      return (
        storyboardConfigHash(
          source.map(({ id, updatedAt }) => ({ id, updatedAt })),
        ) === storyboardConfigHash([op.sourceVersion]) &&
        storyboardConfigHash(
          refs.map(({ id, updatedAt }) => ({ id, updatedAt })),
        ) === storyboardConfigHash(op.referenceVersions)
      );
    } catch {
      return false;
    }
  }
  private async merge(
    org: string,
    brand: string,
    run: string,
    opId: string,
    change: (op: CharacterOperation) => CharacterOperation,
  ) {
    const config = await this.mutate(org, brand, run, (current) => ({
      ...current,
      characterReplacementOperations: (
        current.characterReplacementOperations ?? []
      ).map((op) => (op.operationId === opId ? change(op) : op)),
    }));
    const op = config.characterReplacementOperations?.find(
      (op) => op.operationId === opId,
    );
    if (!op) throw new NotFoundException('Character replacement', opId);
    return { config, op };
  }
  async getStatus(
    org: string,
    brand: string,
    run: string,
    shot: string,
    opId: string,
  ) {
    let config = await this.read(org, brand, run);
    let op = config.characterReplacementOperations?.find(
      (op) =>
        op.operationId === opId &&
        op.shotId === shot &&
        op.runId === run &&
        op.brandId === brand &&
        op.organizationId === org,
    );
    if (!op) throw new NotFoundException('Character replacement', opId);
    if (op.receipts[0] && op.credentialFingerprint && !op.legacy) {
      try {
        const observation = await this.higgsField.getBoundRequestStatus(
          op.receipts[0].requestId,
          org,
          op.credentialFingerprint,
        );
        if (observation.request_id !== op.receipts[0].requestId)
          throw new ConflictException(
            'CHARACTER_REPLACEMENT_STATUS_IDENTITY_MISMATCH',
          );
        ({ config, op } = await this.merge(org, brand, run, opId, (current) =>
          characterObservation(
            current,
            observation.request_id,
            observation.status,
            observation.video?.url,
          ),
        ));
      } catch (error) {
        ({ config, op } = await this.merge(
          org,
          brand,
          run,
          opId,
          (current) => ({
            ...current,
            state: ['ready', 'failed', 'cancelled'].includes(current.state)
              ? current.state
              : 'reconciling',
            errorCode:
              error instanceof ConflictException &&
              error.message === 'CHARACTER_REPLACEMENT_STATUS_IDENTITY_MISMATCH'
                ? 'CHARACTER_REPLACEMENT_STATUS_IDENTITY_MISMATCH'
                : error instanceof BadRequestException
                  ? 'CHARACTER_REPLACEMENT_CREDENTIALS_CHANGED'
                  : 'CHARACTER_REPLACEMENT_STATUS_UNAVAILABLE',
          }),
        ));
      }
    }
    return characterReceipt(op, await this.current(org, brand, config, op));
  }
  async replace(
    org: string,
    brand: string,
    run: string,
    shotId: string,
    body: unknown,
  ): Promise<StoryboardCharacterReplacement> {
    const parsed = replaceStoryboardCharacterSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid character replacement input');
    const input = {
      imageAssetIds: [...new Set(parsed.data.imageAssetIds)],
      prompt: parsed.data.prompt ?? '',
    };
    let config = await this.read(org, brand, run);
    const semantic = (op: {
      shotId: string;
      imageAssetIds: string[];
      prompt?: string;
    }) =>
      op.shotId === shotId &&
      (op.prompt ?? '') === input.prompt &&
      storyboardConfigHash([...new Set(op.imageAssetIds)]) ===
        storyboardConfigHash(input.imageAssetIds);
    const legacy = config.characterReplacements?.find(
      (item) =>
        semantic(item) &&
        !(config.characterReplacementOperations ?? []).some((op) =>
          op.receipts.some((r) => r.requestId === item.requestId),
        ),
    );
    if (legacy) {
      const now = new Date().toISOString();
      const legacyOp: CharacterOperation = {
        version: 1,
        operationId: randomUUID(),
        intentHash: storyboardConfigHash({ legacy: legacy.requestId }),
        organizationId: org,
        brandId: brand,
        runId: run,
        shotId,
        videoAssetId: legacy.videoAssetId,
        imageAssetIds: input.imageAssetIds,
        prompt: input.prompt,
        modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
        legacy: true,
        shotFingerprint: storyboardConfigHash(
          config.plan?.shots.find((s) => s.id === shotId),
        ),
        sourceFingerprint: storyboardConfigHash(config.sourceSnapshot),
        createdAt: now,
        updatedAt: now,
        state: 'blocked',
        errorCode: 'CHARACTER_REPLACEMENT_LEGACY_BINDING_UNKNOWN',
        receipts: [{ requestId: legacy.requestId, status: 'queued' }],
      };
      config = await this.mutate(org, brand, run, (current) => {
        if ((current.characterReplacementOperations ?? []).some(semantic))
          return current;
        if (
          (current.characterReplacementOperations?.length ?? 0) >=
          CHARACTER_JOURNAL_CAPACITY
        )
          throw new ConflictException('CHARACTER_REPLACEMENT_JOURNAL_FULL');
        return {
          ...current,
          characterReplacementOperations: [
            ...(current.characterReplacementOperations ?? []),
            legacyOp,
          ],
        };
      });
    }
    const historical = config.characterReplacementOperations?.find(
      (op) => semantic(op) && op.legacy,
    );
    if (historical) return this.success(historical, config, false);
    const ambiguous = config.characterReplacementOperations?.find(
      (op) =>
        op.shotId === shotId &&
        !op.receipts.length &&
        ['submitting', 'reconciling'].includes(op.state),
    );
    if (ambiguous && !semantic(ambiguous))
      await this.conflict(
        ambiguous,
        config,
        'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
      );
    const shot = config.plan?.shots.find((s) => s.id === shotId);
    if (!shot) throw new NotFoundException('Storyboard shot', shotId);
    const snapshot = config.sourceSnapshot;
    const videoAssetId =
      snapshot.selector.kind === 'uploaded_video'
        ? snapshot.selector.assetId
        : 'media' in snapshot &&
            snapshot.media?.status === 'saved' &&
            snapshot.media.category === 'video'
          ? snapshot.media.assetId
          : undefined;
    if (!videoAssetId)
      throw new ConflictException(
        'Character replace needs an owned source video.',
      );
    await this.source.revalidate(org, brand, snapshot);
    const [videoVersion] = await this.versions(
      org,
      brand,
      [videoAssetId],
      'VIDEO',
    );
    const refs = await this.versions(org, brand, input.imageAssetIds, 'IMAGE');
    const identity = {
      organizationId: org,
      brandId: brand,
      runId: run,
      shotId,
      sourceVersion: { id: videoVersion.id, updatedAt: videoVersion.updatedAt },
      referenceVersions: refs.map(({ id, updatedAt }) => ({ id, updatedAt })),
      shotFingerprint: storyboardConfigHash(shot),
      sourceFingerprint: storyboardConfigHash(snapshot),
      modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
      resolution: HIGGSFIELD_GENJUTSU_DEFAULT_RESOLUTION,
      prompt: input.prompt,
    };
    const intentHash = storyboardConfigHash(identity);
    let op =
      config.characterReplacementOperations?.find(
        (item) => item.intentHash === intentHash,
      ) ?? ambiguous;
    if (op?.receipts.length) {
      const receipt = await this.getStatus(
        org,
        brand,
        run,
        shotId,
        op.operationId,
      );
      const {
        acceptedRequestIds: _ids,
        runId: _run,
        errorCode: _error,
        ...replacement
      } = receipt;
      return storyboardCharacterReplacementSchema.parse({
        ...replacement,
        prompt: input.prompt,
      });
    }
    if (op && (op.leaseUntil ?? 0) > Date.now())
      await this.conflict(op, config, 'CHARACTER_REPLACEMENT_IN_PROGRESS');
    const leaseToken = randomUUID();
    let initial = op?.state === 'blocked';
    if (!op) {
      const video = await this.videos.libraryAsset(org, brand, videoAssetId);
      const imageUrls = refs.map((r) => r.url);
      if (
        !video.url.startsWith('https://') ||
        imageUrls.some((url) => !url?.startsWith('https://'))
      )
        throw new ConflictException('Character media requires HTTPS.');
      const fingerprint = await this.higgsField.getCredentialFingerprint(org);
      const now = new Date().toISOString();
      op = {
        version: 1,
        operationId: randomUUID(),
        intentHash,
        ...identity,
        videoAssetId,
        imageAssetIds: input.imageAssetIds,
        prompt: input.prompt,
        body: {
          video_url: video.url,
          image_urls: imageUrls as string[],
          prompt: input.prompt,
          resolution: identity.resolution,
        },
        credentialFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
        state: 'submitting',
        receipts: [],
      };
      // resolution belongs to the immutable body, not to the journal envelope.
      delete (op as CharacterOperation & { resolution?: string }).resolution;
      initial = true;
    }
    const candidate = op;
    config = await this.mutate(org, brand, run, async (current) => {
      const journal = current.characterReplacementOperations ?? [];
      const ambiguous = journal.find(
        (item) =>
          item.shotId === shotId &&
          !item.receipts.length &&
          ['submitting', 'reconciling'].includes(item.state) &&
          item.intentHash !== candidate.intentHash,
      );
      if (ambiguous)
        return this.conflict(
          ambiguous,
          current,
          'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
        );
      const existing = journal.find(
        (item) =>
          item.intentHash === candidate.intentHash ||
          item.operationId === candidate.operationId,
      );
      if (
        existing?.receipts.length ||
        (existing && (existing.leaseUntil ?? 0) > Date.now())
      ) {
        await this.conflict(
          existing,
          current,
          'CHARACTER_REPLACEMENT_IN_PROGRESS',
        );
      }
      if (!existing && journal.length >= CHARACTER_JOURNAL_CAPACITY)
        throw new ConflictException('CHARACTER_REPLACEMENT_JOURNAL_FULL');
      const claimed = {
        ...(existing ?? candidate),
        leaseToken,
        leaseUntil: Date.now() + CHARACTER_LEASE_MS,
        state: 'submitting' as const,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...current,
        characterReplacementOperations: existing
          ? journal.map((item) =>
              item.operationId === existing.operationId ? claimed : item,
            )
          : [...journal, claimed],
      };
    });
    op = config.characterReplacementOperations?.find(
      (item) => item.leaseToken === leaseToken,
    );
    if (!op) throw new ConflictException('CHARACTER_REPLACEMENT_IN_PROGRESS');
    if (
      initial &&
      !(await this.current(org, brand, await this.read(org, brand, run), op))
    ) {
      const changed = await this.merge(
        org,
        brand,
        run,
        op.operationId,
        (current) => ({
          ...current,
          state: 'blocked',
          errorCode: 'CHARACTER_REPLACEMENT_INPUT_CHANGED',
          leaseUntil: 0,
        }),
      );
      await this.conflict(
        changed.op,
        changed.config,
        'CHARACTER_REPLACEMENT_INPUT_CHANGED',
      );
    }
    if (!op.body || !op.credentialFingerprint)
      return this.conflict(
        op,
        config,
        'CHARACTER_REPLACEMENT_LEGACY_BINDING_UNKNOWN',
      );
    let started = false;
    let submitted: Awaited<
      ReturnType<HiggsFieldService['generateMotionTransfer']>
    >;
    try {
      submitted = await this.higgsField.generateMotionTransfer({
        organizationId: org,
        videoUrl: op.body.video_url,
        imageUrls: op.body.image_urls,
        prompt: op.body.prompt,
        resolution: op.body.resolution,
        idempotencyKey: op.operationId,
        expectedCredentialFingerprint: op.credentialFingerprint,
        onProviderSubmissionStarted: () => {
          started = true;
        },
      });
    } catch (error) {
      const failed = await this.merge(
        org,
        brand,
        run,
        op.operationId,
        (current) => ({
          ...current,
          state: current.receipts.length
            ? current.state
            : started
              ? 'reconciling'
              : 'blocked',
          leaseUntil: started ? current.leaseUntil : 0,
          errorCode:
            current.receipts.length > 1
              ? 'CHARACTER_REPLACEMENT_PROVIDER_IDEMPOTENCY_VIOLATION'
              : error instanceof BadRequestException
                ? 'CHARACTER_REPLACEMENT_CREDENTIALS_CHANGED'
                : started
                  ? 'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED'
                  : 'CHARACTER_REPLACEMENT_SUBMISSION_BLOCKED',
        }),
      );
      return this.conflict(
        failed.op,
        failed.config,
        failed.op.errorCode ?? 'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
      );
    }
    if (
      typeof submitted.requestId !== 'string' ||
      !submitted.requestId.trim() ||
      submitted.requestId.trim().length > 200
    ) {
      const missing = await this.merge(
        org,
        brand,
        run,
        op.operationId,
        (current) => ({
          ...current,
          state: 'reconciling',
          errorCode: 'CHARACTER_REPLACEMENT_RECEIPT_UNKNOWN',
        }),
      );
      return this.conflict(
        missing.op,
        missing.config,
        'CHARACTER_REPLACEMENT_RECEIPT_UNKNOWN',
      );
    }
    let accepted: Awaited<
      ReturnType<StoryboardCharacterReplaceService['merge']>
    >;
    try {
      accepted = await this.merge(org, brand, run, op.operationId, (current) =>
        characterObservation(
          current,
          submitted.requestId.trim(),
          submitted.status,
          submitted.videoUrl,
        ),
      );
    } catch {
      throw new ServiceUnavailableException({
        ...characterReceipt(op, false),
        requestId: submitted.requestId,
        errorCode: 'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
      });
    }
    const current = await this.current(
      org,
      brand,
      accepted.config,
      accepted.op,
    );
    const result = await this.success(accepted.op, accepted.config, current);
    if (current)
      await this.mutate(org, brand, run, (latest) => {
        if (!characterStructuralAssociation(latest, accepted.op)) return latest;
        return {
          ...latest,
          characterReplacements: [
            ...(latest.characterReplacements ?? []).filter(
              (r) => r.shotId !== shotId,
            ),
            result,
          ].slice(-12),
        };
      }).catch(() => undefined);
    return result;
  }
  private async success(
    op: CharacterOperation,
    config: StoryboardStoredRunConfig,
    current: boolean,
  ): Promise<StoryboardCharacterReplacement> {
    const receipt = characterReceipt(op, current);
    if (!receipt.requestId)
      await this.conflict(op, config, 'CHARACTER_REPLACEMENT_RECEIPT_UNKNOWN');
    const {
      acceptedRequestIds: _ids,
      runId: _run,
      errorCode: _error,
      ...replacement
    } = receipt;
    return storyboardCharacterReplacementSchema.parse({
      ...replacement,
      prompt: op.prompt,
    });
  }
}
