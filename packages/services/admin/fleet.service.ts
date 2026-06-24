import type {
  IEC2Instance,
  IFleetAsset,
  IFleetCharacter,
  IFleetHealthResponse,
  IFleetTraining,
  IPipelineCampaign,
  IPipelineStats,
  IServiceStatus,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface IFleetGenerationJob {
  jobId: string;
  status: 'queued' | 'processing' | 'uploading' | 'completed' | 'failed';
  stage: string;
  progress: number;
  personaSlug: string;
  prompt: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  ingredientId?: string;
  cdnUrl?: string;
  error?: string;
}

export interface IBulkEc2ActionResult {
  action: 'start' | 'stop';
  results: Array<{
    instanceId: string;
    name: string;
    state: string;
    success: boolean;
    error?: string;
  }>;
}

export class AdminFleetService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/fleet`, token);
  }

  public static getInstance(token: string): AdminFleetService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminFleetService,
      token,
    ) as AdminFleetService;
  }

  // === Characters ===

  async getCharacters(): Promise<IFleetCharacter[]> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/characters');
    return deserializeCollection<IFleetCharacter>(response.data);
  }

  async getCharacter(slug: string): Promise<IFleetCharacter> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/characters/${slug}`,
    );
    return deserializeResource<IFleetCharacter>(response.data);
  }

  async createCharacter(
    data: Partial<IFleetCharacter>,
  ): Promise<IFleetCharacter> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/characters',
      data,
    );
    return deserializeResource<IFleetCharacter>(response.data);
  }

  async updateCharacter(
    slug: string,
    data: Partial<IFleetCharacter>,
  ): Promise<IFleetCharacter> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/characters/${slug}`,
      data,
    );
    return deserializeResource<IFleetCharacter>(response.data);
  }

  async deleteCharacter(slug: string): Promise<IFleetCharacter> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/characters/${slug}`,
    );
    return deserializeResource<IFleetCharacter>(response.data);
  }

  // === Assets ===

  async getAssets(query?: {
    personaSlug?: string;
    reviewStatus?: string;
    assetLabel?: string;
    contentRating?: string;
    campaign?: string;
    page?: number;
    limit?: number;
  }): Promise<IFleetAsset[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/assets',
      {
        params: query,
      },
    );
    return deserializeCollection<IFleetAsset>(response.data);
  }

  async generateCharacterTrainingData(slug: string): Promise<{
    uploadedCount: number;
    failedCount: number;
    failed: Array<{ filename: string; error: string }>;
  }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/characters/${slug}/training-data`,
    );
    return deserializeResource(response.data);
  }

  async generateAllTrainingData(): Promise<{
    uploadedCount: number;
    failedCount: number;
    failed: Array<{ filename: string; error: string }>;
  }> {
    const response =
      await this.instance.post<JsonApiResponseDocument>('/training-data');
    return deserializeResource(response.data);
  }

  async reviewAsset(
    id: string,
    reviewStatus: string,
    notes?: string,
  ): Promise<IFleetAsset> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/assets/${id}/review`,
      {
        notes,
        reviewStatus,
      },
    );
    return deserializeResource<IFleetAsset>(response.data);
  }

  // === Training ===

  async getTrainings(personaSlug?: string): Promise<IFleetTraining[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/trainings',
      {
        params: personaSlug ? { personaSlug } : {},
      },
    );
    return deserializeCollection<IFleetTraining>(response.data);
  }

  async getTraining(id: string): Promise<IFleetTraining> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/trainings/${id}`,
    );
    return deserializeResource<IFleetTraining>(response.data);
  }

  async startTraining(data: {
    personaSlug: string;
    label: string;
    sourceIds: string[];
    steps?: number;
    learningRate?: number;
    loraRank?: number;
    baseModel?: string;
  }): Promise<IFleetTraining> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/trainings',
      data,
    );
    return deserializeResource<IFleetTraining>(response.data);
  }

  // === Pipeline ===

  async getPipelineStats(): Promise<IPipelineStats> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/pipeline/stats');
    return deserializeResource<IPipelineStats>(response.data);
  }

  async getCampaigns(): Promise<IPipelineCampaign[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/pipeline/campaigns',
    );
    return deserializeCollection<IPipelineCampaign>(response.data);
  }

  // === Infrastructure ===

  async getEC2Status(): Promise<IEC2Instance[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/infrastructure/ec2/status',
    );
    return deserializeCollection<IEC2Instance>(response.data);
  }

  async ec2Action(
    instanceId: string,
    action: 'start' | 'stop',
  ): Promise<{ message: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/infrastructure/ec2/action',
      {
        action,
        instanceId,
      },
    );
    return deserializeResource<{ message: string }>(response.data);
  }

  async ec2ActionAll(
    action: 'start' | 'stop',
    role?: string,
  ): Promise<IBulkEc2ActionResult> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/infrastructure/ec2/action-all',
      {
        action,
        role,
      },
    );
    return deserializeResource<IBulkEc2ActionResult>(response.data);
  }

  async getServiceHealth(): Promise<IServiceStatus[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/infrastructure/services',
    );
    return deserializeCollection<IServiceStatus>(response.data);
  }

  async getFleetHealth(): Promise<IFleetHealthResponse> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/infrastructure/fleet/health',
    );
    return deserializeResource<IFleetHealthResponse>(response.data);
  }

  async invalidateCloudFront(
    distributionId?: string,
    paths?: string[],
  ): Promise<{ invalidationId: string; message: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/infrastructure/cloudfront/invalidate',
      {
        distributionId,
        paths,
      },
    );
    return deserializeResource<{ invalidationId: string; message: string }>(
      response.data,
    );
  }

  // === Datasets ===

  async uploadDataset(
    slug: string,
    images: File[],
    captions?: { filenameStem: string; caption: string }[],
    onProgress?: (progress: number) => void,
  ): Promise<{
    uploadedCount: number;
    failedCount: number;
    failed: { filename: string; error: string }[];
  }> {
    const formData = new FormData();
    for (const image of images) {
      formData.append('images', image);
    }
    if (captions) {
      formData.append('captions', JSON.stringify(captions));
    }

    const response = await this.instance.post<JsonApiResponseDocument>(
      `/characters/${slug}/dataset`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress(percent);
          }
        },
      },
    );
    return deserializeResource<{
      uploadedCount: number;
      failedCount: number;
      failed: { filename: string; error: string }[];
    }>(response.data);
  }

  // === Generation ===

  async generateImage(data: {
    personaSlug: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    steps?: number;
    aspectRatio?: string;
    lora?: string;
    seed?: number;
    cfgScale?: number;
  }): Promise<{ id: string; cdnUrl: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/generate',
      data,
    );
    return deserializeResource<{ id: string; cdnUrl: string }>(response.data);
  }

  async createGenerationJob(data: {
    personaSlug: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    steps?: number;
    aspectRatio?: string;
    lora?: string;
    seed?: number;
    cfgScale?: number;
  }): Promise<IFleetGenerationJob> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/generate/jobs',
      data,
    );
    return deserializeResource<IFleetGenerationJob>(response.data);
  }

  async getGenerationJob(jobId: string): Promise<IFleetGenerationJob> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/generate/jobs/${jobId}`,
    );
    return deserializeResource<IFleetGenerationJob>(response.data);
  }

  // === Lip Sync ===

  async generateLipSync(data: {
    personaSlug: string;
    imageUrl: string;
    audioUrl?: string;
    text?: string;
  }): Promise<{ jobId: string; status: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/lip-sync',
      data,
    );
    return deserializeResource<{ jobId: string; status: string }>(
      response.data,
    );
  }

  async getLipSyncStatus(
    jobId: string,
  ): Promise<{ status: string; videoUrl?: string }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/lip-sync/${jobId}`,
    );
    return deserializeResource<{ status: string; videoUrl?: string }>(
      response.data,
    );
  }

  // === Voices / TTS ===

  async getVoices(): Promise<
    { voiceId: string; name: string; preview?: string }[]
  > {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/voices');
    return deserializeCollection<{
      voiceId: string;
      name: string;
      preview?: string;
    }>(response.data);
  }

  async generateVoice(data: {
    personaSlug?: string;
    text: string;
    voiceId: string;
    speed?: number;
  }): Promise<{ audioUrl: string }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/voices/generate',
      data,
    );
    return deserializeResource<{ audioUrl: string }>(response.data);
  }
}
