import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { ShotRenderOperation } from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { VideoQaContinuityResolverService } from '@api/collections/workflows/services/video-qa-continuity-resolver.service';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { storyboardShotBibleReferences } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-prompt.contract';
import {
  STORYBOARD_SHOT_QA_HARD_FAILURES,
  type StoryboardShotQa,
} from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import type { VideoContinuityClipFinding } from '@genfeedai/contracts/interfaces';
import {
  buildVideoQaReport,
  DEFAULT_VIDEO_QA_BLACK_DURATION_SECONDS,
  DEFAULT_VIDEO_QA_FREEZE_DURATION_SECONDS,
  DEFAULT_VIDEO_QA_LOUDNESS_TARGET_LUFS,
  DEFAULT_VIDEO_QA_LOUDNESS_TOLERANCE_LUFS,
} from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import { ConflictException, Injectable } from '@nestjs/common';

/** A check that started this long ago and never finished is run again. */
export const SHOT_QA_STALE_MS = 10 * 60_000;
const HARD_FAILURES = new Set<string>(STORYBOARD_SHOT_QA_HARD_FAILURES);

function needsCheck(op: ShotRenderOperation, now: number): boolean {
  if (op.stage !== 'final' || op.state !== 'ready' || !op.assetId) return false;
  if (!op.qa) return true;
  return (
    op.qa.state === 'checking' &&
    now - Date.parse(op.qa.checkedAt) > SHOT_QA_STALE_MS
  );
}

/** Drift on any dimension flags the shot; nothing else does. */
function continuityOf(
  finding: VideoContinuityClipFinding | undefined,
): StoryboardShotQa['continuity'] {
  if (!finding) return { state: 'skipped', notes: [] };
  const dimensions = [finding.character, finding.outfit, finding.product];
  const drifted = dimensions.filter((item) => item.verdict === 'drift');
  return {
    state: drifted.length ? 'flagged' : 'consistent',
    notes: drifted
      .map((item) => item.summary.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 6),
  };
}

/**
 * Checks each final shot render before assembly (#9621), with the same
 * ffprobe inspection as the `video-qa` workflow node. A clip that fails to
 * decode, goes black or freezes blocks assembly and can be rendered again.
 * Continuity against the shot's asset bible images only flags the shot.
 */
@Traced()
@Injectable()
export class StoryboardShotQaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly files: FilesClientService,
    private readonly continuity: VideoQaContinuityResolverService,
    private readonly logger: LoggerService,
  ) {}

  /** Checks every final render that is ready and unchecked. Safe to repeat. */
  async check(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRun> {
    const { config, record } = await this.store.read(
      organizationId,
      brandId,
      runId,
    );
    const now = Date.now();
    const due = (config.shotRenderOperations ?? []).filter((op) =>
      needsCheck(op, now),
    );
    let run = projectStoryboardRun(record);
    for (const op of due) {
      // Only the request that claims a check runs it.
      const claimed = await this.claim(organizationId, brandId, runId, op);
      if (!claimed) continue;
      const qa = await this.inspect(organizationId, brandId, op, claimed);
      run = await this.record(organizationId, brandId, runId, op, qa);
    }
    return run;
  }

  private async claim(
    organizationId: string,
    brandId: string,
    runId: string,
    op: ShotRenderOperation,
  ) {
    const { config } = await this.store.read(organizationId, brandId, runId);
    const current = config.shotRenderOperations?.find(
      (item) => item.operationId === op.operationId,
    );
    if (!current || !needsCheck(current, Date.now())) return undefined;
    const checking: StoryboardShotQa = {
      state: 'checking',
      failures: [],
      checkedAt: new Date().toISOString(),
    };
    try {
      await this.store.save(
        organizationId,
        brandId,
        runId,
        config,
        storyboardStoredRunConfigSchema.parse({
          ...config,
          shotRenderOperations: config.shotRenderOperations?.map((item) =>
            item.operationId === op.operationId
              ? { ...item, qa: checking }
              : item,
          ),
        }),
      );
    } catch (error: unknown) {
      // Another request claimed it, or the run changed: it is checked there.
      if (error instanceof ConflictException) return undefined;
      throw error;
    }
    return config;
  }

  private async inspect(
    organizationId: string,
    brandId: string,
    op: ShotRenderOperation,
    config: NonNullable<Awaited<ReturnType<StoryboardShotQaService['claim']>>>,
  ): Promise<StoryboardShotQa> {
    const checkedAt = new Date().toISOString();
    const shot = config.plan.shots.find((item) => item.id === op.shotId);
    const characterIds = shot
      ? storyboardShotBibleReferences(config.plan, shot).map(
          (reference) => reference.assetId,
        )
      : [];
    const productIds = (shot?.referenceRoles ?? [])
      .filter((reference) => reference.role === 'prop')
      .map((reference) => reference.assetId);
    const urls = await this.urls(organizationId, brandId, [
      op.assetId ?? '',
      ...characterIds,
      ...productIds,
    ]);
    const videoUrl = op.assetId ? urls.get(op.assetId) : undefined;
    if (!videoUrl) return { state: 'unavailable', failures: [], checkedAt };
    const characterReferenceUrls = characterIds.flatMap(
      (id) => urls.get(id) ?? [],
    );
    const productReferenceUrls = productIds.flatMap((id) => urls.get(id) ?? []);
    const hasReferences =
      characterReferenceUrls.length > 0 || productReferenceUrls.length > 0;
    try {
      const inspection = await this.files.inspectVideoQa({
        videoUrl,
        isContactSheetEnabled: hasReferences,
        blackDurationSeconds: DEFAULT_VIDEO_QA_BLACK_DURATION_SECONDS,
        freezeDurationSeconds: DEFAULT_VIDEO_QA_FREEZE_DURATION_SECONDS,
      });
      const report = buildVideoQaReport({
        inspection,
        contract: {
          loudnessTargetLufs: DEFAULT_VIDEO_QA_LOUDNESS_TARGET_LUFS,
          loudnessToleranceLufs: DEFAULT_VIDEO_QA_LOUDNESS_TOLERANCE_LUFS,
        },
      });
      const failures = report.failures
        .filter((failure) => HARD_FAILURES.has(failure.code))
        .slice(0, 20)
        .map((failure) => ({
          code: failure.code as (typeof STORYBOARD_SHOT_QA_HARD_FAILURES)[number],
          message: failure.message.slice(0, 300),
          timestamp: failure.timestamp,
        }));
      const continuity =
        hasReferences && inspection.contactSheetUrl
          ? continuityOf(
              (
                await this.continuity.resolve({
                  characterReferenceUrls,
                  contactSheetUrl: inspection.contactSheetUrl,
                  organizationId,
                  productReferenceUrls,
                  runId: op.operationId,
                  videoUrl,
                })
              ).finding,
            )
          : undefined;
      return {
        state: failures.length ? 'failed' : 'passed',
        failures,
        ...(continuity ? { continuity } : {}),
        checkedAt,
      };
    } catch (error: unknown) {
      // QA that cannot run never blocks: the clip is shown unchecked.
      this.logger.error('Storyboard shot QA failed to run', error, {
        organizationId,
        operationId: op.operationId,
      });
      return { state: 'unavailable', failures: [], checkedAt };
    }
  }

  /** Public URLs of the brand's own images and clips, by id. */
  private async urls(
    organizationId: string,
    brandId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.ingredient.findMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: [...new Set(ids.filter(Boolean))] },
      }),
    });
    return new Map(
      rows.flatMap((row) => {
        const url = readIngredientMediaUrl(row);
        return url ? [[row.id, url] as const] : [];
      }),
    );
  }

  /** Writes the result onto the render it checked, retried on contention. */
  private async record(
    organizationId: string,
    brandId: string,
    runId: string,
    op: ShotRenderOperation,
    qa: StoryboardShotQa,
  ): Promise<StoryboardRun> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { config } = await this.store.read(organizationId, brandId, runId);
      try {
        return await this.store.save(
          organizationId,
          brandId,
          runId,
          config,
          storyboardStoredRunConfigSchema.parse({
            ...config,
            shotRenderOperations: config.shotRenderOperations?.map((item) =>
              item.operationId === op.operationId ? { ...item, qa } : item,
            ),
          }),
        );
      } catch (error: unknown) {
        if (!(error instanceof ConflictException) || attempt === 4) throw error;
      }
    }
    throw new ConflictException('The storyboard is busy. Retry shortly.');
  }
}
