import { Readable } from 'node:stream';
import type {
  AgentSourceArtifact,
  AgentSourceIngestContext,
  AgentSourceIngestInput,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import {
  resolveSafeDestination,
  safeFetch,
} from '@libs/security/destination-guard';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export class AgentSourceImportPendingError extends ServiceUnavailableException {}
class SourceExtractionFailedError extends ServiceUnavailableException {}

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const MIME_TYPES: Readonly<
  Record<string, Pick<AgentSourceArtifact, 'kind' | 'extension'>>
> = {
  'image/jpeg': { kind: 'image', extension: 'JPEG' },
  'image/png': { kind: 'image', extension: 'PNG' },
  'image/gif': { kind: 'image', extension: 'GIF' },
  'image/webp': { kind: 'image', extension: 'WEBP' },
  'video/mp4': { kind: 'video', extension: 'MP4' },
  'video/webm': { kind: 'video', extension: 'WEBM' },
  'video/quicktime': { kind: 'video', extension: 'MOV' },
  'audio/mpeg': { kind: 'audio', extension: 'MP3' },
  'audio/wav': { kind: 'audio', extension: 'WAV' },
  'audio/x-wav': { kind: 'audio', extension: 'WAV' },
};

function finiteNonnegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
async function* boundedBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      bytes += result.value.byteLength;
      if (bytes > MAX_SOURCE_BYTES)
        throw new BadRequestException(
          'Source exceeds the 200 MB import limit.',
        );
      yield result.value;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

@Injectable()
export class AgentSourceDownloadService {
  constructor(
    private readonly files: FilesClientService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async normalizeUrl(raw: string): Promise<string> {
    const destination = await resolveSafeDestination(raw);
    const url = destination.url;
    url.hash = '';
    if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
        url.hostname,
      )
    ) {
      const videoId =
        url.hostname === 'youtu.be'
          ? url.pathname.slice(1)
          : url.pathname === '/watch'
            ? url.searchParams.get('v')
            : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
      if (
        url.protocol !== 'https:' ||
        !videoId ||
        !/^[a-zA-Z0-9_-]{11}$/.test(videoId)
      )
        throw new BadRequestException('Use a valid HTTPS YouTube video URL.');
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url.href;
  }

  async download(
    url: string,
    ingredientId: string,
    kind: AgentSourceIngestInput['kind'],
    context: AgentSourceIngestContext,
    pendingJobId?: string,
    onJobQueued?: (jobId: string) => Promise<void>,
  ): Promise<AgentSourceArtifact> {
    if (new URL(url).hostname === 'www.youtube.com') {
      if (kind && kind !== 'video')
        throw new BadRequestException(
          'YouTube sources must be imported as video.',
        );
      try {
        return await this.downloadYoutube(
          url,
          ingredientId,
          context,
          pendingJobId,
          onJobQueued,
        );
      } catch (error) {
        if (error instanceof SourceExtractionFailedError) throw error;
        throw new AgentSourceImportPendingError(
          'Source extraction may still be running. Reopen this import to observe its existing job.',
        );
      }
    }
    const response = await safeFetch(url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok || !response.body)
      throw new BadRequestException('The source could not be downloaded.');
    const contentType =
      response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() ?? '';
    const media = MIME_TYPES[contentType];
    if (!media || (kind && media.kind !== kind)) {
      await response.body.cancel();
      throw new BadRequestException(
        'The URL must return a supported media file matching the selected kind.',
      );
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) {
      await response.body.cancel();
      throw new BadRequestException('Source exceeds the 200 MB import limit.');
    }
    const stream = Readable.from(boundedBody(response.body));
    try {
      const uploaded = await this.files.uploadStreamToS3(
        ingredientId,
        media.kind === 'image'
          ? 'images'
          : media.kind === 'video'
            ? 'videos'
            : 'audios',
        {
          contentType,
          data: stream,
          filename: `source.${media.extension.toLowerCase()}`,
        },
      );
      if (!uploaded.publicUrl || typeof uploaded.s3Key !== 'string')
        throw new ServiceUnavailableException(
          'Source storage did not return a durable artifact.',
        );
      return {
        ...media,
        publicUrl: uploaded.publicUrl,
        storageKey: uploaded.s3Key,
        width: finiteNonnegative(uploaded.width),
        height: finiteNonnegative(uploaded.height),
        duration: finiteNonnegative(uploaded.duration),
        size: finiteNonnegative(uploaded.size),
        hasAudio: uploaded.hasAudio === true,
      };
    } finally {
      stream.destroy();
    }
  }

  private async downloadYoutube(
    url: string,
    ingredientId: string,
    context: AgentSourceIngestContext,
    pendingJobId?: string,
    onJobQueued?: (jobId: string) => Promise<void>,
  ): Promise<AgentSourceArtifact> {
    const baseUrl = this.config.get('GENFEEDAI_MICROSERVICES_FILES_URL');
    if (typeof baseUrl !== 'string' || !baseUrl)
      throw new SourceExtractionFailedError(
        'Source import storage is not configured.',
      );
    const expectedJobId = `agent-source-${ingredientId}`;
    const jobId = pendingJobId ?? expectedJobId;
    if (!pendingJobId) {
      await onJobQueued?.(expectedJobId);
      await this.enqueueYoutube(url, ingredientId, context, baseUrl);
    }
    const deadline = Date.now() + CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS;
    let requeuedMissingJob = false;
    while (Date.now() < deadline) {
      let envelope: Record<string, unknown>;
      try {
        const observation = await firstValueFrom(
          this.http.get<unknown>(
            `${baseUrl}/v1/files/job/${encodeURIComponent(jobId)}`,
            { timeout: 30_000 },
          ),
        );
        envelope = record(observation.data);
      } catch (error) {
        if (
          jobId !== expectedJobId ||
          requeuedMissingJob ||
          !this.isMissingJob(error)
        )
          throw error;
        requeuedMissingJob = true;
        await this.enqueueYoutube(url, ingredientId, context, baseUrl);
        continue;
      }
      const job =
        'state' in envelope || 'status' in envelope
          ? envelope
          : record(envelope.data);
      const state = job.status ?? job.state;
      if (state === 'failed' || state === 'FAILED')
        throw new SourceExtractionFailedError('Source extraction failed.');
      if (state === 'completed' || state === 'COMPLETED') {
        const result = record(job.result ?? job);
        if (
          typeof result.sourceUrl !== 'string' ||
          typeof result.sourceS3Key !== 'string'
        )
          throw new ServiceUnavailableException(
            'Source extraction completed without a durable video.',
          );
        const metadata = await this.files.extractMetadataFromUrl(
          result.sourceUrl,
        );
        return {
          publicUrl: result.sourceUrl,
          storageKey: result.sourceS3Key,
          kind: 'video',
          extension: 'MP4',
          duration: finiteNonnegative(
            result.sourceDurationSeconds ?? metadata.duration,
          ),
          width: finiteNonnegative(metadata.width),
          height: finiteNonnegative(metadata.height),
          size: finiteNonnegative(metadata.size),
          hasAudio: metadata.hasAudio === true,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new ServiceUnavailableException(
      'Source extraction is still running; reopen this import before retrying.',
    );
  }
  private async enqueueYoutube(
    url: string,
    ingredientId: string,
    context: AgentSourceIngestContext,
    baseUrl: string,
  ): Promise<void> {
    const expectedJobId = `agent-source-${ingredientId}`;
    const response = await firstValueFrom(
      this.http.post<unknown>(
        `${baseUrl}/v1/files/process/video`,
        {
          id: expectedJobId,
          ingredientId,
          organizationId: context.organizationId,
          userId: context.userId,
          params: { inputPath: url },
          type: 'video-to-audio',
        },
        { timeout: 30_000 },
      ),
    );
    const payload = record(response.data);
    const jobId = payload.jobId ?? record(payload.data).jobId;
    if (jobId !== expectedJobId) {
      throw new ServiceUnavailableException(
        'Files did not honor the source extraction job identity.',
      );
    }
  }

  private isMissingJob(error: unknown): boolean {
    const response = record(record(error).response);
    if (response.status === 404) return true;
    return (
      response.status === 500 &&
      record(response.data).message === 'Job not found'
    );
  }
}
