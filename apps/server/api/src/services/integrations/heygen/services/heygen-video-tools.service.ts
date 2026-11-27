import { randomUUID } from 'node:crypto';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import {
  HEYGEN_API_ORIGIN,
  readHeyGenVideoStatus,
} from '@api/services/integrations/heygen/helpers/heygen-video';
import {
  buildHeyGenVideoAgentBody,
  HEYGEN_VIDEO_AGENT_PATH,
  HEYGEN_VIDEO_AGENT_POLL_INTERVAL_MS,
  HEYGEN_VIDEO_AGENT_POLL_TIMEOUT_MS,
  heyGenVideoAgentStatusUrl,
  heyGenVideoAgentVideoUrl,
  isHeyGenVideoAgentTerminal,
  readHeyGenVideoAgentSession,
  readHeyGenVideoAgentStatus,
} from '@api/services/integrations/heygen/helpers/heygen-video-agent';
import {
  buildHeyGenVideoTranslationBody,
  HEYGEN_VIDEO_TRANSLATION_PATH,
  HEYGEN_VIDEO_TRANSLATION_POLL_INTERVAL_MS,
  HEYGEN_VIDEO_TRANSLATION_POLL_TIMEOUT_MS,
  type HeyGenTranslatedVideo,
  heyGenVideoTranslationStatusUrl,
  isHeyGenVideoTranslationTerminal,
  readHeyGenVideoTranslationId,
  readHeyGenVideoTranslationStatus,
} from '@api/services/integrations/heygen/helpers/heygen-video-translation';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

/**
 * HeyGen Video Agent (one prompt, one finished video) and Video Translation
 * (a source video dubbed into other languages). Endpoint and field shapes come
 * from HeyGen's public API reference; see the helper files for what that
 * reference leaves undocumented.
 */
@Traced()
@Injectable()
export class HeyGenVideoToolsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly pollUntilService: PollUntilService,
    private readonly heyGenService: HeyGenService,
  ) {}

  public async generateVideoAgentVideo(params: {
    apiKeyOverride?: string;
    onProviderSubmissionStarted?: () => void;
    prompt: string;
  }): Promise<{ videoUrl: string }> {
    const apiKey = await this.resolveApiKey(params.apiKeyOverride);
    const body = this.build(() => buildHeyGenVideoAgentBody(params.prompt));
    params.onProviderSubmissionStarted?.();
    const response = await this.post(apiKey, HEYGEN_VIDEO_AGENT_PATH, body);
    const session = readHeyGenVideoAgentSession(response);
    if (!session) {
      throw new Error('HeyGen Video Agent submission returned no session id.');
    }
    const status = await this.poll(
      () =>
        this.get(apiKey, heyGenVideoAgentStatusUrl(session.sessionId)).then(
          readHeyGenVideoAgentStatus,
        ),
      (value) => isHeyGenVideoAgentTerminal(value.status),
      HEYGEN_VIDEO_AGENT_POLL_INTERVAL_MS,
      HEYGEN_VIDEO_AGENT_POLL_TIMEOUT_MS,
      `HeyGen Video Agent ${session.sessionId}`,
    );
    if (status.status !== 'completed') {
      throw new Error(
        status.failureMessage ||
          `HeyGen Video Agent ${session.sessionId} ended as ${status.status}.`,
      );
    }
    const videoId = status.videoId ?? session.videoId;
    if (!videoId) {
      throw new Error(
        `HeyGen Video Agent ${session.sessionId} finished without a video id.`,
      );
    }
    const video = readHeyGenVideoStatus(
      await this.get(apiKey, heyGenVideoAgentVideoUrl(videoId)),
    );
    if (!video.videoUrl) {
      throw new Error(`HeyGen video ${videoId} has no downloadable URL yet.`);
    }
    return { videoUrl: video.videoUrl };
  }

  public async translateVideo(params: {
    apiKeyOverride?: string;
    languages: readonly string[];
    onProviderSubmissionStarted?: () => void;
    videoUrl: string;
  }): Promise<{ outputs: HeyGenTranslatedVideo[] }> {
    const apiKey = await this.resolveApiKey(params.apiKeyOverride);
    const body = this.build(() => buildHeyGenVideoTranslationBody(params));
    params.onProviderSubmissionStarted?.();
    const response = await this.post(
      apiKey,
      HEYGEN_VIDEO_TRANSLATION_PATH,
      body,
    );
    const translationId = readHeyGenVideoTranslationId(response);
    if (!translationId) {
      throw new Error('HeyGen Video Translation returned no translation id.');
    }
    const status = await this.poll(
      () =>
        this.get(apiKey, heyGenVideoTranslationStatusUrl(translationId)).then(
          readHeyGenVideoTranslationStatus,
        ),
      (value) => isHeyGenVideoTranslationTerminal(value.status),
      HEYGEN_VIDEO_TRANSLATION_POLL_INTERVAL_MS,
      HEYGEN_VIDEO_TRANSLATION_POLL_TIMEOUT_MS,
      `HeyGen Video Translation ${translationId}`,
    );
    if (status.status !== 'completed' || status.outputs.length === 0) {
      throw new Error(
        status.failureMessage ||
          `HeyGen Video Translation ${translationId} ended as ${status.status}.`,
      );
    }
    return { outputs: status.outputs };
  }

  private async resolveApiKey(apiKeyOverride?: string): Promise<string> {
    if (apiKeyOverride) return apiKeyOverride;
    return (
      await this.heyGenService.resolveOrganizationConnection(
        'platform',
        'platform',
      )
    ).apiKey;
  }

  private build<T>(make: () => T): T {
    try {
      return make();
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid HeyGen request.',
      );
    }
  }

  private headers(apiKey: string) {
    return { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
  }

  private async post(
    apiKey: string,
    path: string,
    body: unknown,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${HEYGEN_API_ORIGIN}${path}`, body, {
          headers: { ...this.headers(apiKey), 'Idempotency-Key': randomUUID() },
        }),
      );
      return response.data;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 402) {
        throw new HeyGenSubmissionRejectedError();
      }
      throw error;
    }
  }

  /** A client error is final; a server error or a dropped call reads as no news. */
  private async get(apiKey: string, url: string): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.headers(apiKey) }),
      );
      return response.data;
    } catch (error: unknown) {
      const statusCode = isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (statusCode !== undefined && statusCode < 500) throw error;
      return undefined;
    }
  }

  private async poll<T>(
    read: () => Promise<T>,
    isDone: (value: T) => boolean,
    intervalMs: number,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    try {
      const { value } = await this.pollUntilService.poll(read, isDone, {
        intervalMs,
        timeoutMs,
      });
      return value;
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new Error(`${label} timed out after ${error.timeoutMs}ms.`);
      }
      throw error;
    }
  }
}
