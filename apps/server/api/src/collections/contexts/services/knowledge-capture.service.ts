import { createHash } from 'node:crypto';
import type { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeRefreshService } from '@api/collections/contexts/services/knowledge-refresh.service';
import { isIngestibleKnowledgeSourceKind } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import {
  KnowledgeProcessingState,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceCapturePayload,
  KnowledgeSourceCaptureProvenance,
} from '@genfeedai/contracts/interfaces';
import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
} from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface KnowledgeCaptureResult {
  jobId?: string;
  source: KnowledgeSource;
  version?: KnowledgeSourceVersion;
}

export interface KnowledgeVersionIngestResult {
  jobId: string;
  version: KnowledgeSourceVersion;
}

export const KNOWLEDGE_CAPTURE_SOURCE = 'api';

export function hashKnowledgeContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * Build the immutable version record for one capture. The hash identifies the
 * captured text, or the location for fetched sources, so a repeated capture of
 * the same material is recognisable without re-reading the payload.
 */
export function buildCaptureVersion(
  dto: Pick<
    CreateKnowledgeSourceDto,
    | 'isTranscriptGenerationAllowed'
    | 'provenance'
    | 'referenceUrl'
    | 'text'
    | 'title'
    | 'transcriptUrl'
  >,
  observedAt = new Date(),
): CreateKnowledgeVersionDto {
  const payload: KnowledgeSourceCapturePayload = {
    ...(dto.referenceUrl ? { referenceUrl: dto.referenceUrl } : {}),
    ...(dto.text ? { text: dto.text } : {}),
    ...(dto.transcriptUrl ? { transcriptUrl: dto.transcriptUrl } : {}),
    ...(dto.isTranscriptGenerationAllowed
      ? { isTranscriptGenerationAllowed: true }
      : {}),
  };
  const provenance: KnowledgeSourceCaptureProvenance = {
    capturedAt: observedAt.toISOString(),
    capturedBy: KNOWLEDGE_CAPTURE_SOURCE,
    title: dto.title,
    ...(dto.referenceUrl ? { url: dto.referenceUrl } : {}),
    ...(dto.provenance ?? {}),
  };
  return {
    contentHash: hashKnowledgeContent(dto.text ?? dto.referenceUrl ?? ''),
    observedAt: observedAt.toISOString(),
    payload: JSON.parse(JSON.stringify(payload)),
    provenance: JSON.parse(JSON.stringify(provenance)),
  };
}

/**
 * Every capture surface enters here: create or extend a canonical source, then
 * hand the exact version to the immutable ingestion workflow. Nothing else
 * fetches, extracts, chunks or embeds.
 */
@Injectable()
export class KnowledgeCaptureService {
  constructor(
    private readonly records: KnowledgeRecordsService,
    private readonly ingestWorkflow: KnowledgeSourceIngestWorkflowService,
    private readonly refresh: KnowledgeRefreshService,
  ) {}

  async capture(
    actor: KnowledgeActor,
    dto: CreateKnowledgeSourceDto,
    idempotencyKey?: string,
  ): Promise<KnowledgeCaptureResult> {
    if (dto.sourceId) {
      return this.refreshExisting(actor, dto.sourceId);
    }
    const hasPayload = Boolean(dto.text || dto.referenceUrl);
    if (hasPayload) {
      this.assertCapturable(dto.kind, dto);
    }
    if (idempotencyKey !== undefined) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
        throw new BadRequestException(
          'Idempotency-Key must contain 8–128 letters, digits, dots, colons, underscores or hyphens',
        );
      }
      if (!hasPayload)
        throw new BadRequestException(
          'Idempotent capture requires text or a reference URL',
        );
      const requestHash = hashKnowledgeContent(
        JSON.stringify({
          scope: dto.scope,
          title: dto.title,
          kind: dto.kind,
          purpose: dto.purpose,
          text: dto.text ?? null,
          referenceUrl: dto.referenceUrl ?? null,
          provenance: dto.provenance ?? null,
        }),
      );
      const result = await this.records.createIdempotentCapture(
        actor,
        dto,
        buildCaptureVersion(dto),
        idempotencyKey,
        requestHash,
      );
      if (result.version.processingState !== KnowledgeProcessingState.QUEUED)
        return result;
      const jobId = await this.ingestWorkflow.enqueueIngest({
        organizationId: actor.organizationId,
        sourceId: result.source.id,
        versionId: result.version.id,
      });
      return { ...result, jobId };
    }
    const source = await this.records.createSource(actor, dto);
    if (!hasPayload) {
      return { source };
    }
    const ingested = await this.createVersion(
      actor,
      source.id,
      buildCaptureVersion(dto),
    );
    return { jobId: ingested.jobId, source, version: ingested.version };
  }

  async unscheduleRefresh(
    actor: KnowledgeActor,
    sourceId: string,
  ): Promise<void> {
    await this.refresh.unscheduleSource(actor, sourceId);
  }

  async refreshExisting(
    actor: KnowledgeActor,
    sourceId: string,
    _provenance?: KnowledgeSourceCaptureProvenance,
    tickKey?: string,
  ): Promise<KnowledgeCaptureResult> {
    const source = await this.records.getSource(actor, sourceId);
    const kind =
      source.kind === KnowledgeSourceKind.RSS
        ? KnowledgeSourceKind.RSS
        : source.kind === KnowledgeSourceKind.URL
          ? KnowledgeSourceKind.URL
          : null;
    if (!kind) {
      throw new BadRequestException(
        'Refresh capture is only supported for URL and RSS sources',
      );
    }
    const current = await this.records.getCurrentVersion(actor, sourceId);
    const payload =
      current.payload &&
      typeof current.payload === 'object' &&
      !Array.isArray(current.payload)
        ? (current.payload as KnowledgeSourceCapturePayload)
        : {};
    const referenceUrl = payload.referenceUrl;
    if (!referenceUrl) {
      throw new BadRequestException(
        'Source has no captured reference URL to refresh',
      );
    }
    this.assertCapturable(kind, { referenceUrl });
    const resolvedTickKey = tickKey ?? `manual:${sourceId}:${Date.now()}`;
    const refreshed = await this.refresh.refresh(
      actor,
      sourceId,
      resolvedTickKey,
      { force: !tickKey },
    );
    const version = await this.records
      .getCurrentVersion(actor, sourceId)
      .catch(() => undefined);
    return {
      jobId: refreshed.jobId,
      source,
      version,
    };
  }

  async createVersion(
    actor: KnowledgeActor,
    sourceId: string,
    dto: CreateKnowledgeVersionDto,
  ): Promise<KnowledgeVersionIngestResult> {
    const version = await this.records.createVersion(actor, sourceId, dto);
    const jobId = await this.ingestWorkflow.enqueueIngest({
      organizationId: actor.organizationId,
      sourceId,
      versionId: version.id,
    });
    return { jobId, version };
  }

  /**
   * Re-run ingestion for the current version. Requeueing keeps the version
   * identity, so a retry never creates a duplicate source, version or chunk.
   */
  async retry(
    actor: KnowledgeActor,
    sourceId: string,
  ): Promise<KnowledgeVersionIngestResult> {
    const current = await this.records.getCurrentVersion(actor, sourceId);
    if (current.processingState === KnowledgeProcessingState.READY) {
      throw new BadRequestException(
        'Source is already ingested; capture a new version to refresh it',
      );
    }
    if (current.processingState === KnowledgeProcessingState.PROCESSING) {
      throw new BadRequestException('Source is still being ingested');
    }
    const version =
      current.processingState === KnowledgeProcessingState.FAILED
        ? await this.records.setProcessing(
            actor,
            sourceId,
            current.id,
            KnowledgeProcessingState.QUEUED,
          )
        : current;
    const jobId = await this.ingestWorkflow.enqueueIngest({
      organizationId: actor.organizationId,
      sourceId,
      versionId: version.id,
    });
    return { jobId, version };
  }

  async backfill(organizationId: string): Promise<{ jobId: string }> {
    const jobId = await this.ingestWorkflow.enqueueBackfill({ organizationId });
    return { jobId };
  }

  private assertCapturable(
    kind: KnowledgeSourceKind,
    payload: KnowledgeSourceCapturePayload,
  ): void {
    if (!isIngestibleKnowledgeSourceKind(kind)) {
      throw new BadRequestException(`${kind} sources are not ingested yet`);
    }
    if (kind === KnowledgeSourceKind.TEXT && !payload.text) {
      throw new BadRequestException('TEXT sources require captured text');
    }
    if (kind !== KnowledgeSourceKind.TEXT && !payload.referenceUrl) {
      throw new BadRequestException(`${kind} sources require a reference URL`);
    }
  }
}
