import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { AuthService } from '@services/auth.service';
import { captureExtensionError } from '@services/error-tracking.service';
import { getValidatedApiEndpoint } from '@services/trusted-origins';
import type {
  ApiError,
  ApiResponse,
  DraftRecord,
  DraftSavePayload,
  GeneratedImage,
  GeneratedVideo,
  ImageGenerationPayload,
  ImagePreset,
  PromptTemplate,
} from '@/types';

export class ApiService {
  private static instance: ApiService;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = getValidatedApiEndpoint();
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
      `/images?latest=true&limit=${limit}`,
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
      `/videos?latest=true&limit=${limit}`,
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

  executeAgentTool(
    name: CuratedActionName,
    parameters: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    return this.request<AgentToolResult>(
      'POST',
      `/agent-tools/${encodeURIComponent(name)}/execute`,
      { parameters },
    );
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
