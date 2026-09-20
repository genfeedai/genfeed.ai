import { KNOWLEDGE_SOURCE_MAX_BYTES } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  fetchKnowledgeBytes,
  KnowledgeFetchProhibitedError,
  knowledgeMediaByteLimit,
} from '@api/collections/contexts/utils/knowledge-bounded-fetch.util';
import {
  discoverHtml5Media,
  isDirectKnowledgeMediaMime,
  isDirectKnowledgeMediaUrl,
} from '@api/collections/contexts/utils/knowledge-html5-media.util';
import {
  parseSrt,
  parseWebVtt,
  type TranscriptCue,
} from '@api/collections/contexts/utils/knowledge-transcript.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  KNOWLEDGE_CAPTURE_TRANSCRIPT_CREDIT,
  KNOWLEDGE_TRANSCRIPT_GENERATION_LEASE_MS,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeTranscriptState,
} from '@genfeedai/contracts';
import type { KnowledgeSourceCapturePayload } from '@genfeedai/contracts/interfaces';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface KnowledgeTranscriptResolution {
  cues: TranscriptCue[];
  mediaUrl?: string;
  mimeType: string;
  reservationId?: string;
  text: string;
  transcriptState: KnowledgeTranscriptState;
  transcriptUrl?: string;
}

interface TranscriptGenerationClaim {
  attempt?: number;
  leaseExpiresAt: string;
  reservationId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPayload(value: unknown): KnowledgeSourceCapturePayload & {
  isTranscriptGenerationAllowed?: boolean;
  transcriptGeneration?: TranscriptGenerationClaim;
  transcriptReservationId?: string;
} {
  if (!isRecord(value)) {
    return {};
  }
  const cues = Array.isArray(value.transcriptCues)
    ? value.transcriptCues.filter(
        (cue): cue is TranscriptCue =>
          isRecord(cue) &&
          typeof cue.text === 'string' &&
          typeof cue.startMs === 'number' &&
          typeof cue.endMs === 'number',
      )
    : undefined;
  const claim = isRecord(value.transcriptGeneration)
    ? value.transcriptGeneration
    : undefined;
  return {
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
    ...(typeof value.referenceUrl === 'string'
      ? { referenceUrl: value.referenceUrl }
      : {}),
    ...(typeof value.transcriptUrl === 'string'
      ? { transcriptUrl: value.transcriptUrl }
      : {}),
    ...(typeof value.mediaUrl === 'string' ? { mediaUrl: value.mediaUrl } : {}),
    ...(cues ? { transcriptCues: cues } : {}),
    ...(value.transcriptState === KnowledgeTranscriptState.RESOLVED ||
    value.transcriptState === KnowledgeTranscriptState.GENERATED ||
    value.transcriptState === KnowledgeTranscriptState.UNAVAILABLE ||
    value.transcriptState === KnowledgeTranscriptState.PROHIBITED
      ? { transcriptState: value.transcriptState }
      : {}),
    isTranscriptGenerationAllowed: value.isTranscriptGenerationAllowed === true,
    ...(typeof value.transcriptReservationId === 'string'
      ? { transcriptReservationId: value.transcriptReservationId }
      : {}),
    ...(typeof claim?.leaseExpiresAt === 'string'
      ? {
          transcriptGeneration: {
            ...(typeof claim.attempt === 'number'
              ? { attempt: claim.attempt }
              : {}),
            leaseExpiresAt: claim.leaseExpiresAt,
            ...(typeof claim.reservationId === 'string'
              ? { reservationId: claim.reservationId }
              : {}),
          },
        }
      : {}),
  };
}

function parseCaptionDocument(
  bytes: Buffer,
  mimeType: string,
  url: string,
): TranscriptCue[] {
  const text = bytes.toString('utf8');
  const looksVtt =
    mimeType.includes('vtt') ||
    url.toLowerCase().endsWith('.vtt') ||
    text.trimStart().startsWith('WEBVTT');
  return looksVtt ? parseWebVtt(text) : parseSrt(text);
}

function cuesToText(cues: TranscriptCue[]): string {
  return cues
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mediaFilename(mimeType: string): string {
  if (mimeType === 'audio/mpeg') return 'knowledge-media.mp3';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    return 'knowledge-media.wav';
  }
  if (mimeType === 'audio/ogg') return 'knowledge-media.ogg';
  if (mimeType === 'audio/flac') return 'knowledge-media.flac';
  if (mimeType === 'video/webm' || mimeType === 'audio/webm') {
    return 'knowledge-media.webm';
  }
  return 'knowledge-media.mp4';
}

@Injectable()
export class KnowledgeTranscriptIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replicate: ReplicateService,
    private readonly credits: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(input: {
    kind: KnowledgeSourceKind;
    organizationId: string;
    payload: unknown;
    referenceUrl: string;
    sourceId: string;
    userId: string;
    versionId: string;
  }): Promise<KnowledgeTranscriptResolution> {
    const stored = await this.prisma.knowledgeSourceVersion.findFirst({
      select: { payload: true, transcriptState: true },
      where: {
        id: input.versionId,
        isDeleted: false,
        organizationId: input.organizationId,
        sourceId: input.sourceId,
      },
    });
    const payload = {
      ...readPayload(stored?.payload),
      ...readPayload(input.payload),
      ...(stored?.transcriptState
        ? {
            transcriptState: stored.transcriptState as KnowledgeTranscriptState,
          }
        : {}),
    };
    if (
      payload.transcriptCues &&
      payload.transcriptCues.length > 0 &&
      (payload.transcriptState === KnowledgeTranscriptState.RESOLVED ||
        payload.transcriptState === KnowledgeTranscriptState.GENERATED)
    ) {
      if (
        payload.transcriptState === KnowledgeTranscriptState.GENERATED &&
        payload.transcriptReservationId
      ) {
        // A saved generated transcript is billed exactly once: settlement is
        // idempotent, so this completes a charge an earlier run saved the
        // transcript for but did not finish settling.
        await this.settleTranscriptCredit(
          input,
          payload.transcriptReservationId,
        ).catch((error: unknown) => {
          // An expired or released hold can no longer be charged; the saved
          // transcript is still served rather than failing ingest forever.
          if (error instanceof UnsettleableReservationException) {
            this.logger.log('Knowledge transcript hold expired before settle', {
              organizationId: input.organizationId,
              reservationId: payload.transcriptReservationId,
              versionId: input.versionId,
            });
            return;
          }
          throw error;
        });
      }
      return {
        cues: payload.transcriptCues,
        mediaUrl: payload.mediaUrl,
        mimeType: 'text/vtt',
        text: cuesToText(payload.transcriptCues),
        transcriptState:
          payload.transcriptState ?? KnowledgeTranscriptState.RESOLVED,
        transcriptUrl: payload.transcriptUrl,
      };
    }

    const explicitCaption = payload.transcriptUrl;
    if (explicitCaption) {
      return this.resolvePublishedCaption(
        input,
        explicitCaption,
        payload.referenceUrl,
      );
    }

    const fetched = await this.fetchPageOrMedia(input.referenceUrl);
    if (isDirectKnowledgeMediaMime(fetched.mimeType, input.kind)) {
      if (!payload.isTranscriptGenerationAllowed) {
        throw this.unavailable(
          'No transcript is available for this media source',
          KnowledgeTranscriptState.UNAVAILABLE,
        );
      }
      return this.generateFromMedia(
        { ...input, payload },
        fetched.bytes,
        fetched.finalUrl,
        fetched.mimeType,
      );
    }

    const discovered = discoverHtml5Media({
      html: fetched.bytes.toString('utf8'),
      kind: input.kind,
      pageUrl: fetched.finalUrl,
    });
    if (discovered.isProhibited) {
      throw this.unavailable(
        discovered.reason ?? 'The source prohibits automated access',
        KnowledgeTranscriptState.PROHIBITED,
      );
    }
    if (discovered.captionUrl) {
      return this.resolvePublishedCaption(
        input,
        discovered.captionUrl,
        discovered.mediaUrl ?? fetched.finalUrl,
      );
    }
    if (!payload.isTranscriptGenerationAllowed) {
      throw this.unavailable(
        discovered.reason ?? 'No transcript is available for this media source',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }
    if (!discovered.mediaUrl) {
      throw this.unavailable(
        discovered.reason ?? 'No public media resource is available',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }
    const media = await this.fetchMedia(discovered.mediaUrl);
    if (!isDirectKnowledgeMediaMime(media.mimeType, input.kind)) {
      throw this.unavailable(
        'The media resource is not a supported public file',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }
    return this.generateFromMedia(
      { ...input, payload },
      media.bytes,
      media.finalUrl,
      media.mimeType,
    );
  }

  private async resolvePublishedCaption(
    input: {
      organizationId: string;
      sourceId: string;
      versionId: string;
    },
    captionUrl: string,
    mediaUrl?: string,
  ): Promise<KnowledgeTranscriptResolution> {
    const caption = await fetchKnowledgeBytes({
      maxBytes: KNOWLEDGE_SOURCE_MAX_BYTES,
      referenceUrl: captionUrl,
    });
    const cues = parseCaptionDocument(
      caption.bytes,
      caption.mimeType,
      caption.finalUrl,
    );
    if (cues.length === 0) {
      throw this.unavailable(
        'The published transcript has no timestamped cues',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }
    const resolution: KnowledgeTranscriptResolution = {
      cues,
      mediaUrl,
      mimeType: caption.mimeType || 'text/vtt',
      text: cuesToText(cues),
      transcriptState: KnowledgeTranscriptState.RESOLVED,
      transcriptUrl: caption.finalUrl,
    };
    await this.checkpoint(input, resolution);
    return resolution;
  }

  private async generateFromMedia(
    input: {
      organizationId: string;
      payload: unknown;
      sourceId: string;
      userId: string;
      versionId: string;
    },
    bytes: Buffer,
    mediaUrl: string,
    mimeType: string,
  ): Promise<KnowledgeTranscriptResolution> {
    const payload = readPayload(input.payload);
    const existingClaim = payload.transcriptGeneration;
    if (
      existingClaim &&
      Date.parse(existingClaim.leaseExpiresAt) > Date.now()
    ) {
      throw this.unavailable(
        'Transcript generation is already in progress; retry after the prior attempt expires',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }

    const attempt =
      typeof existingClaim?.attempt === 'number'
        ? existingClaim.attempt + 1
        : 0;
    let reservationId: string | undefined;
    let isCheckpointed = false;
    try {
      const reservation = await this.reserveTranscriptCredits(input, attempt);
      reservationId = reservation.id;
      await this.writeGenerationClaim(input, reservation.id, attempt);

      const result = await this.replicate.transcribeAudio({
        audio: {
          data: bytes,
          filename: mediaFilename(mimeType),
          type: 'buffer',
        },
      });
      const cues = (result.segments ?? [])
        .map((segment) => ({
          endMs: Math.round(segment.end * 1000),
          startMs: Math.round(segment.start * 1000),
          text: segment.text.trim(),
        }))
        .filter((cue) => cue.text && cue.endMs >= cue.startMs);
      if (cues.length === 0) {
        throw new Error('Generated transcript has no timestamped cues');
      }
      const resolution: KnowledgeTranscriptResolution = {
        cues,
        mediaUrl,
        mimeType,
        reservationId,
        text: cuesToText(cues),
        transcriptState: KnowledgeTranscriptState.GENERATED,
      };
      // Persist the transcript before charging for it. A failure before this
      // point releases the hold; settling first would leave a paid transcript
      // unsaved, and a retry after the lease would reserve under a new key.
      await this.checkpoint(input, resolution);
      isCheckpointed = true;
      await this.settleTranscriptCredit(input, reservationId);
      await this.prisma.knowledgeCaptureRequest.updateMany({
        where: {
          isDeleted: false,
          organizationId: input.organizationId,
          sourceId: input.sourceId,
          status: 'queued',
        },
        data: { reservationId, status: 'completed' },
      });
      return resolution;
    } catch (error: unknown) {
      // Once the transcript is saved the hold is owed: a retry settles it from
      // the checkpoint instead of generating (and reserving) again.
      if (reservationId && !isCheckpointed) {
        await this.credits
          .releaseReservation({
            organizationId: input.organizationId,
            reservationId,
          })
          .catch(() => undefined);
      }
      if (error instanceof Error && /insufficient/i.test(error.message)) {
        throw this.unavailable(
          'Transcript generation needs one available credit',
          KnowledgeTranscriptState.UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  private async settleTranscriptCredit(
    input: { organizationId: string; userId: string },
    reservationId: string,
  ): Promise<void> {
    await this.credits.settleReservation({
      actualAmount: KNOWLEDGE_CAPTURE_TRANSCRIPT_CREDIT,
      actorUserId: input.userId,
      description: 'Knowledge transcript generation',
      organizationId: input.organizationId,
      reservationId,
      source: ActivitySource.SCRIPT,
    });
  }

  private async reserveTranscriptCredits(
    input: {
      organizationId: string;
      userId: string;
      versionId: string;
    },
    attempt: number,
  ): Promise<ICreditReservation> {
    const reservation = await this.credits.reserveCredits({
      actorUserId: input.userId,
      amount: KNOWLEDGE_CAPTURE_TRANSCRIPT_CREDIT,
      idempotencyKey: `knowledge-transcript:${input.organizationId}:${input.versionId}:${attempt}`,
      organizationId: input.organizationId,
      workloadId: input.versionId,
      workloadType: 'knowledge-transcript',
    });
    if (
      (reservation.status === CreditReservationStatus.RELEASED ||
        reservation.status === CreditReservationStatus.EXPIRED) &&
      attempt < 5
    ) {
      return this.reserveTranscriptCredits(input, attempt + 1);
    }
    if (reservation.status === CreditReservationStatus.SETTLED) {
      throw this.unavailable(
        'Transcript generation was already billed for this version',
        KnowledgeTranscriptState.UNAVAILABLE,
      );
    }
    return reservation;
  }

  private async fetchPageOrMedia(referenceUrl: string) {
    try {
      return await fetchKnowledgeBytes({
        maxBytes:
          isDirectKnowledgeMediaUrl(referenceUrl, KnowledgeSourceKind.VIDEO) ||
          isDirectKnowledgeMediaUrl(referenceUrl, KnowledgeSourceKind.AUDIO)
            ? knowledgeMediaByteLimit()
            : KNOWLEDGE_SOURCE_MAX_BYTES,
        referenceUrl,
      });
    } catch (error: unknown) {
      if (error instanceof KnowledgeFetchProhibitedError) {
        throw this.unavailable(
          error.message,
          KnowledgeTranscriptState.PROHIBITED,
        );
      }
      throw error;
    }
  }

  private async fetchMedia(mediaUrl: string) {
    try {
      return await fetchKnowledgeBytes({
        maxBytes: knowledgeMediaByteLimit(),
        referenceUrl: mediaUrl,
      });
    } catch (error: unknown) {
      if (error instanceof KnowledgeFetchProhibitedError) {
        throw this.unavailable(
          error.message,
          KnowledgeTranscriptState.PROHIBITED,
        );
      }
      throw error;
    }
  }

  private unavailable(
    message: string,
    state: KnowledgeTranscriptState,
  ): Error & { transcriptState: KnowledgeTranscriptState } {
    const error = new Error(message) as Error & {
      transcriptState: KnowledgeTranscriptState;
    };
    error.transcriptState = state;
    return error;
  }

  private async writeGenerationClaim(
    input: { organizationId: string; sourceId: string; versionId: string },
    reservationId: string,
    attempt: number,
  ): Promise<void> {
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      select: { payload: true },
      where: scopedWhere(input.organizationId, {
        id: input.versionId,
        sourceId: input.sourceId,
      }),
    });
    const payload = isRecord(version?.payload) ? { ...version.payload } : {};
    payload.transcriptGeneration = {
      attempt,
      leaseExpiresAt: new Date(
        Date.now() + KNOWLEDGE_TRANSCRIPT_GENERATION_LEASE_MS,
      ).toISOString(),
      reservationId,
    };
    await this.prisma.knowledgeSourceVersion.updateMany({
      where: scopedWhere(input.organizationId, {
        id: input.versionId,
        sourceId: input.sourceId,
      }),
      data: { payload },
    });
  }

  private async checkpoint(
    input: { organizationId: string; sourceId: string; versionId: string },
    resolution: KnowledgeTranscriptResolution,
  ): Promise<void> {
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      select: { payload: true, provenance: true },
      where: scopedWhere(input.organizationId, {
        id: input.versionId,
        sourceId: input.sourceId,
      }),
    });
    const payload = isRecord(version?.payload) ? { ...version.payload } : {};
    const provenance = isRecord(version?.provenance)
      ? { ...version.provenance }
      : {};
    delete payload.transcriptGeneration;
    await this.prisma.knowledgeSourceVersion.updateMany({
      where: scopedWhere(input.organizationId, {
        id: input.versionId,
        processingState: {
          in: [
            KnowledgeProcessingState.QUEUED,
            KnowledgeProcessingState.PROCESSING,
          ],
        },
        sourceId: input.sourceId,
      }),
      data: {
        payload: toPrismaJson({
          ...payload,
          mediaUrl: resolution.mediaUrl,
          text: resolution.text,
          transcriptCues: resolution.cues,
          transcriptState: resolution.transcriptState,
          ...(resolution.transcriptUrl
            ? { transcriptUrl: resolution.transcriptUrl }
            : {}),
          ...(resolution.reservationId
            ? { transcriptReservationId: resolution.reservationId }
            : {}),
        }),
        provenance: toPrismaJson({
          ...provenance,
          transcriptProvider:
            resolution.transcriptState === KnowledgeTranscriptState.GENERATED
              ? 'replicate-whisper'
              : 'published-caption',
        }),
        transcriptState: resolution.transcriptState,
      },
    });
    this.logger.log('Knowledge transcript checkpointed', {
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      transcriptState: resolution.transcriptState,
      versionId: input.versionId,
    });
  }
}
