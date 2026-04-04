import { AuthService } from '@services/auth.service';
import { captureExtensionError } from '@services/error-tracking.service';
import * as vscode from 'vscode';
import type {
  ApiError,
  ApiResponse,
  CampaignAuthoringContext,
  DraftRecord,
  DraftSavePayload,
  GeneratedImage,
  GeneratedVideo,
  ImageGenerationPayload,
  ImagePreset,
  PromptTemplate,
  RunActionType,
  RunRecord,
  RunTimelineEvent,
} from '@/types';

export class ApiService {
  private static instance: ApiService;
  private baseUrl: string;

  private constructor() {
    const config = vscode.workspace.getConfiguration('genfeed');
    this.baseUrl = config.get<string>('apiEndpoint', 'https://api.genfeed.ai');
  }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await AuthService.getInstance().getToken();
    if (!token) {
      throw new Error('Not authenticated. Please sign in or set an API key.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const headers = await this.getHeaders();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers,
      method,
    });

    const responseText = await response.text();
    const payload = parseJson(responseText);

    if (!response.ok) {
      const error = payload as ApiError | undefined;
      const apiError = new Error(
        error?.message || `API request failed: ${response.status}`,
      );
      captureExtensionError('API request failed', apiError, {
        endpoint,
        method,
        status: response.status,
      });
      throw apiError;
    }

    return payload as T;
  }

  // Image Generation
  async generateImage(
    payload: ImageGenerationPayload,
  ): Promise<GeneratedImage> {
    const result = await this.request<ApiResponse<GeneratedImage>>(
      'POST',
      '/images',
      {
        ...payload,
        waitForCompletion: payload.waitForCompletion ?? true,
      },
    );
    return result.data;
  }

  async getGeneratedImages(limit = 20): Promise<GeneratedImage[]> {
    const result = await this.request<ApiResponse<GeneratedImage[]>>(
      'GET',
      `/images/latest?limit=${limit}`,
    );
    return result.data;
  }

  async getImageById(id: string): Promise<GeneratedImage> {
    const result = await this.request<ApiResponse<GeneratedImage>>(
      'GET',
      `/images/${id}`,
    );
    return result.data;
  }

  // Video Generation
  async getGeneratedVideos(limit = 20): Promise<GeneratedVideo[]> {
    const result = await this.request<ApiResponse<GeneratedVideo[]>>(
      'GET',
      `/videos/latest?limit=${limit}`,
    );
    return result.data;
  }

  async getVideoById(id: string): Promise<GeneratedVideo> {
    const result = await this.request<ApiResponse<GeneratedVideo>>(
      'GET',
      `/videos/${id}`,
    );
    return result.data;
  }

  // Presets Management
  async getPresets(): Promise<ImagePreset[]> {
    const result = await this.request<ApiResponse<ImagePreset[]>>(
      'GET',
      '/presets',
    );
    return result.data;
  }

  async createPreset(
    preset: Omit<ImagePreset, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ImagePreset> {
    const result = await this.request<ApiResponse<ImagePreset>>(
      'POST',
      '/presets',
      preset,
    );
    return result.data;
  }

  async updatePreset(
    id: string,
    preset: Partial<ImagePreset>,
  ): Promise<ImagePreset> {
    const result = await this.request<ApiResponse<ImagePreset>>(
      'PATCH',
      `/presets/${id}`,
      preset,
    );
    return result.data;
  }

  async deletePreset(id: string): Promise<void> {
    await this.request<void>('DELETE', `/presets/${id}`);
  }

  // Models
  async getAvailableModels(): Promise<
    { key: string; name: string; category: string }[]
  > {
    const result = await this.request<
      ApiResponse<{ key: string; name: string; category: string }[]>
    >('GET', '/models?category=IMAGE');
    return result.data;
  }

  // Templates
  async getContentTemplates(): Promise<PromptTemplate[]> {
    const contentTemplates = await this.request<
      ApiResponse<PromptTemplate[]> | PromptTemplate[]
    >('GET', '/templates?purpose=prompt');

    return extractDataArray(contentTemplates);
  }

  // Runs Control Plane
  async createRun(
    actionType: RunActionType,
    input: Record<string, unknown>,
    options?: {
      campaign?: CampaignAuthoringContext;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<RunRecord> {
    const result = await this.request<{ reused: boolean; run: RunRecord }>(
      'POST',
      '/runs',
      {
        actionType,
        campaign: options?.campaign,
        idempotencyKey: options?.idempotencyKey,
        input,
        metadata: options?.metadata,
        surface: 'ide',
        trigger: 'manual',
      },
    );

    return result.run;
  }

  executeRun(runId: string): Promise<RunRecord> {
    return this.request<RunRecord>('POST', `/runs/${runId}/execute`);
  }

  getRun(runId: string): Promise<RunRecord> {
    return this.request<RunRecord>('GET', `/runs/${runId}`);
  }

  async listRuns(options?: {
    actionType?: RunActionType;
    limit?: number;
    status?: string;
  }): Promise<RunRecord[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.actionType) {
      params.set('actionType', options.actionType);
    }
    if (options?.status) {
      params.set('status', options.status);
    }

    const query = params.toString();
    const endpoint = query ? `/runs?${query}` : '/runs';
    const result = await this.request<
      ApiResponse<RunRecord[]> | { runs: RunRecord[] } | RunRecord[]
    >('GET', endpoint);

    if (Array.isArray(result)) {
      return result;
    }

    if ('runs' in result && Array.isArray(result.runs)) {
      return result.runs;
    }

    return extractDataArray(result);
  }

  async getRunTimeline(runId: string): Promise<RunTimelineEvent[]> {
    const result = await this.request<
      ApiResponse<RunTimelineEvent[]> | RunTimelineEvent[]
    >('GET', `/runs/${runId}/timeline`);
    return extractDataArray(result);
  }

  // Drafts
  async saveDraft(payload: DraftSavePayload): Promise<DraftRecord> {
    const result = await this.request<ApiResponse<DraftRecord>>(
      'POST',
      '/drafts',
      payload,
    );
    return result.data;
  }

  async listDrafts(options?: {
    channel?: string;
    limit?: number;
    status?: string;
  }): Promise<DraftRecord[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.channel) {
      params.set('channel', options.channel);
    }
    if (options?.status) {
      params.set('status', options.status);
    }

    const query = params.toString();
    const endpoint = query ? `/drafts?${query}` : '/drafts';
    const result = await this.request<
      ApiResponse<DraftRecord[]> | DraftRecord[]
    >('GET', endpoint);

    if (Array.isArray(result)) {
      return result;
    }

    return extractDataArray(result);
  }

  async createAndExecuteRun(
    actionType: RunActionType,
    input: Record<string, unknown>,
    options?: {
      campaign?: CampaignAuthoringContext;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<RunRecord> {
    const run = await this.createRun(actionType, input, options);
    const runId = run._id || run.id;

    if (!runId) {
      throw new Error('Run response is missing an id.');
    }

    return this.executeRun(runId);
  }
}

function parseJson(value: string): unknown {
  if (!value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractDataArray<T>(value: ApiResponse<T[]> | T[] | unknown): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray((value as ApiResponse<T[]>).data)
  ) {
    return (value as ApiResponse<T[]>).data;
  }

  return [];
}
