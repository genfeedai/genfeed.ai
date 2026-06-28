import type { BaseApiClient } from './base-api-client';
import type {
  GenerateDarkroomContentParams,
  StartTrainingParams,
} from './darkroom.client.types';

/**
 * Darkroom (GPU pipeline) admin/infrastructure, LoRA training, and on-box
 * generation methods — CLI parity surface.
 */
export class DarkroomClient {
  constructor(private readonly base: BaseApiClient) {}

  // ── Admin / Infrastructure ──

  getDarkroomHealth(): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting darkroom health',
      async (http) =>
        this.base.unwrapObject(await http.get('/darkroom/health')),
      this.base.failWith('Failed to get darkroom health'),
    );
  }

  controlComfyUi(
    action: string,
    confirm?: boolean,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'controlling ComfyUI',
      async (http) =>
        this.base.unwrapObject(
          await http.post('/darkroom/comfyui/control', { action, confirm }),
        ),
      this.base.failWith('Failed to control ComfyUI'),
    );
  }

  listLoras(): Promise<unknown[]> {
    return this.base.request(
      'listing LoRAs',
      async (http) => this.base.unwrapList(await http.get('/darkroom/loras')),
      this.base.failWith('Failed to list LoRAs'),
    );
  }

  listGpuPersonas(): Promise<unknown[]> {
    return this.base.request(
      'listing GPU personas',
      async (http) =>
        this.base.unwrapList(await http.get('/darkroom/personas')),
      this.base.failWith('Failed to list GPU personas'),
    );
  }

  // ── Training Pipeline ──

  startTraining(params: StartTrainingParams): Promise<Record<string, unknown>> {
    return this.base.request(
      'starting training',
      async (http) =>
        this.base.unwrapObject(await http.post('/training/start', params)),
      this.base.failWith('Failed to start training'),
    );
  }

  getTrainingStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting training status',
      async (http) =>
        this.base.unwrapObject(await http.get(`/training/status/${jobId}`)),
      this.base.failWith('Failed to get training status'),
    );
  }

  getDatasetInfo(handle: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting dataset info',
      async (http) =>
        this.base.unwrapObject(await http.get(`/datasets/${handle}`)),
      this.base.failWith('Failed to get dataset info'),
    );
  }

  deleteDataset(
    handle: string,
    confirm: boolean,
  ): Promise<Record<string, unknown>> {
    if (!confirm) {
      return Promise.resolve({
        message: `This will permanently delete dataset "${handle}". Pass confirm: true to proceed.`,
        preview: true,
      });
    }
    return this.base.request(
      'deleting dataset',
      async (http) =>
        this.base.unwrapObject(await http.delete(`/datasets/${handle}`)),
      this.base.failWith('Failed to delete dataset'),
    );
  }

  runCaptioning(handle: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'running captioning',
      async (http) =>
        this.base.unwrapObject(await http.post(`/datasets/${handle}/caption`)),
      this.base.failWith('Failed to run captioning'),
    );
  }

  // ── Darkroom Generation ──

  generateDarkroomContent(
    params: GenerateDarkroomContentParams,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'generating darkroom content',
      async (http) =>
        this.base.unwrapObject(await http.post('/darkroom/generate', params)),
      this.base.failWith('Failed to generate darkroom content'),
    );
  }

  getDarkroomJobStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting darkroom job status',
      async (http) =>
        this.base.unwrapObject(
          await http.get(`/darkroom/generate/status/${jobId}`),
        ),
      this.base.failWith('Failed to get darkroom job status'),
    );
  }
}
