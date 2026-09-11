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
  task_id?: string;
}

interface MurekaQueryResponse {
  status?: string;
  choices?: Array<{ url?: string; audio_url?: string }>;
  error?: string;
}

const MUREKA_POLL_INTERVAL_MS = 3_000;
const MUREKA_POLL_TIMEOUT_MS = 180_000;

/**
 * Mureka V9 direct API integration — not fal/Replicate. Contract per
 * https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
 * (POST /v1/song/generate, Bearer auth, GET /v1/song/query/{task_id} to
 * poll). Field names beyond `prompt`/`lyrics`/`instrumental`/`model` should
 * be reconfirmed against a live account before this model is activated in
 * the registry (it seeds `isActive: false`).
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
    return (
      (this.configService.get('MUREKA_API_BASE_URL') as string | undefined) ||
      'https://platform.mureka.ai'
    );
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
    this.ensureConfigured();
    const model =
      input.model || (this.configService.get('MUREKA_MODEL') as string) || 'V9';

    this.loggerService.log(`${this.logContext} generateSong started`, {
      instrumental: input.instrumental,
      model,
      prompt: input.prompt?.substring(0, 100),
    });

    try {
      const submitRes = await firstValueFrom(
        this.httpService.post<MurekaGenerateResponse>(
          `${this.baseUrl()}/v1/song/generate`,
          {
            instrumental: input.instrumental ?? false,
            lyrics: input.lyrics,
            model,
            prompt: input.prompt,
          },
          { headers: this.headers() },
        ),
      );

      const taskId = submitRes.data?.task_id ?? submitRes.data?.id;
      if (!taskId) {
        throw new Error(
          `Mureka returned no task id: ${JSON.stringify(submitRes.data).substring(0, 200)}`,
        );
      }

      const audioUrl = await this.pollForCompletion(taskId);

      this.loggerService.log(`${this.logContext} generateSong completed`, {
        taskId,
      });

      return { audioUrl, taskId };
    } catch (error: unknown) {
      this.loggerService.error(`${this.logContext} generateSong failed`, error);
      throw error;
    }
  }

  private async pollForCompletion(taskId: string): Promise<string> {
    try {
      const { value } = await this.pollUntilService.poll(
        () =>
          firstValueFrom(
            this.httpService.get<MurekaQueryResponse>(
              `${this.baseUrl()}/v1/song/query/${taskId}`,
              { headers: this.headers() },
            ),
          ).then((res) => res.data),
        (data) => {
          const status = data?.status?.toLowerCase();
          if (status === 'failed' || status === 'error') {
            throw new Error(
              `Mureka generation failed: ${data?.error || 'Unknown error'}`,
            );
          }
          return status === 'succeeded' || status === 'completed';
        },
        {
          intervalMs: MUREKA_POLL_INTERVAL_MS,
          timeoutMs: MUREKA_POLL_TIMEOUT_MS,
        },
      );

      const audioUrl =
        value?.choices?.[0]?.url ?? value?.choices?.[0]?.audio_url;
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
