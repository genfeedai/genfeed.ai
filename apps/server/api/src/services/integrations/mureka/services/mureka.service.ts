import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface MurekaGenerateSongInput {
  instrumental?: boolean;
  lyrics?: string;
  model?: string;
  prompt: string;
}

export interface MurekaSongResult {
  audioUrl: string;
  taskId: string;
}

interface MurekaGenerateResponse {
  id?: string;
}

interface MurekaQueryResponse {
  status?: string;
  choices?: Array<{ url?: string }>;
  failed_reason?: string;
}

type MurekaTaskKind = 'instrumental' | 'song';

interface MurekaSubmission {
  body: Record<string, unknown>;
  kind: MurekaTaskKind;
  path: string;
}

const MUREKA_DEFAULT_BASE_URL = 'https://api.mureka.ai';
const MUREKA_DEFAULT_MODEL = 'mureka-9';
// Mureka bills per output and defaults to two; Genfeed consumes one choice.
const MUREKA_OUTPUTS_PER_REQUEST = 1;
const MUREKA_POLL_INTERVAL_MS = 3_000;
const MUREKA_POLL_TIMEOUT_MS = 180_000;

/**
 * Mureka direct API integration — not fal/Replicate. Contract per the
 * official reference at https://platform.mureka.ai/docs/api/ :
 * - lyrics → POST /v1/song/generate (`lyrics` is required there)
 * - prompt-only song → POST /v1/song/easy-generate
 * - instrumental → POST /v1/instrumental/generate
 * Each returns a task `id`, polled on /v1/song/query/{id} or
 * /v1/instrumental/query/{id} respectively. Neither accepts a duration.
 */
@Injectable()
export class MurekaService {
  private readonly logContext = 'MurekaService';

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly pollUntilService: PollUntilService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('MUREKA_API_KEY'));
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'Mureka is not configured. Set MUREKA_API_KEY environment variable.',
      );
    }
  }

  private baseUrl(): string {
    const configured =
      this.configService.get('MUREKA_API_BASE_URL') ?? MUREKA_DEFAULT_BASE_URL;
    try {
      const url = new URL(String(configured));
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      return url.toString().replace(/\/+$/, '');
    } catch {
      throw new Error(
        'Mureka base URL must be an absolute HTTPS URL without credentials, query or fragment.',
      );
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.configService.get('MUREKA_API_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  async generateSong(
    input: MurekaGenerateSongInput,
  ): Promise<MurekaSongResult> {
    const baseUrl = this.baseUrl();
    this.ensureConfigured();
    const model =
      input.model ||
      (this.configService.get('MUREKA_MODEL') as string) ||
      MUREKA_DEFAULT_MODEL;
    const submission = this.buildSubmission(input, model);

    this.loggerService.log(`${this.logContext} generateSong started`, {
      kind: submission.kind,
      model,
      path: submission.path,
      prompt: input.prompt?.substring(0, 100),
    });

    try {
      const submitRes = await firstValueFrom(
        this.httpService.post<MurekaGenerateResponse>(
          `${baseUrl}${submission.path}`,
          submission.body,
          { headers: this.headers(), maxRedirects: 0 },
        ),
      );

      const taskId = submitRes.data?.id;
      if (!taskId) {
        throw new Error(
          `Mureka returned no task id: ${JSON.stringify(submitRes.data).substring(0, 200)}`,
        );
      }

      const audioUrl = await this.pollForCompletion(
        taskId,
        baseUrl,
        submission.kind,
      );

      this.loggerService.log(`${this.logContext} generateSong completed`, {
        taskId,
      });

      return { audioUrl, taskId };
    } catch (error: unknown) {
      this.loggerService.error(`${this.logContext} generateSong failed`, error);
      throw error;
    }
  }

  private buildSubmission(
    input: MurekaGenerateSongInput,
    model: string,
  ): MurekaSubmission {
    if (input.instrumental) {
      return {
        body: { model, n: MUREKA_OUTPUTS_PER_REQUEST, prompt: input.prompt },
        kind: 'instrumental',
        path: '/v1/instrumental/generate',
      };
    }

    const lyrics = input.lyrics?.trim();
    if (lyrics) {
      return {
        body: {
          lyrics,
          model,
          n: MUREKA_OUTPUTS_PER_REQUEST,
          prompt: input.prompt,
        },
        kind: 'song',
        path: '/v1/song/generate',
      };
    }

    return {
      body: { model, n: MUREKA_OUTPUTS_PER_REQUEST, prompt: input.prompt },
      kind: 'song',
      path: '/v1/song/easy-generate',
    };
  }

  private async pollForCompletion(
    taskId: string,
    baseUrl: string,
    kind: MurekaTaskKind,
  ): Promise<string> {
    try {
      const { value } = await this.pollUntilService.poll(
        () =>
          firstValueFrom(
            this.httpService.get<MurekaQueryResponse>(
              `${baseUrl}/v1/${kind}/query/${encodeURIComponent(taskId)}`,
              { headers: this.headers(), maxRedirects: 0 },
            ),
          ).then((res) => res.data),
        (data) => {
          const status = data?.status?.toLowerCase();
          // Mureka's terminal-but-unsuccessful states must be treated as
          // failures rather than left to fall through to "not yet done" —
          // otherwise a real cancelled/timed-out task spins for the full
          // poll timeout instead of failing fast.
          if (
            status === 'failed' ||
            status === 'timeouted' ||
            status === 'cancelled'
          ) {
            throw new Error(
              `Mureka generation ${status}: ${data?.failed_reason || 'Unknown error'}`,
            );
          }
          return status === 'succeeded';
        },
        {
          intervalMs: MUREKA_POLL_INTERVAL_MS,
          timeoutMs: MUREKA_POLL_TIMEOUT_MS,
        },
      );

      const audioUrl = value?.choices?.[0]?.url;
      if (!audioUrl) {
        throw new Error(
          `Mureka completed with no audio URL: ${JSON.stringify(value).substring(0, 200)}`,
        );
      }
      return audioUrl;
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new Error('Mureka generation timed out');
      }
      throw error;
    }
  }
}
