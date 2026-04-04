/**
 * Profiles Service
 * Brand consistency: tone/style profiles for images, videos, voice, and articles.
 * Apply brand voice to prompts, analyze tone compliance, auto-generate from examples.
 * Backend: /profiles API
 */

import type {
  IApplyToneRequest,
  IApplyToneResult,
  IToneAnalysis,
  IToneProfile,
} from '@cloud/interfaces/ai/tone-profile.interface';
import {
  deserializeCollection,
  deserializeResource,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type DeserializeMode = 'resource' | 'collection' | 'none';

class ProfilesServiceClass {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    method: HttpMethod,
    body?: unknown,
    errorMessage?: string,
    deserialize: DeserializeMode = 'none',
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      method,
    });

    if (!response.ok) {
      const error = new Error(errorMessage || `Request failed: ${endpoint}`);
      logger.error(errorMessage || 'Request failed', { endpoint, error });
      throw error;
    }

    const json = await response.json();

    if (deserialize === 'resource') {
      return deserializeResource<T>(json);
    }

    if (deserialize === 'collection') {
      return deserializeCollection(json) as T;
    }

    return json;
  }

  async getToneProfiles(): Promise<IToneProfile[]> {
    return this.request(
      '/profiles',
      'GET',
      undefined,
      'Failed to get tone profiles',
      'collection',
    );
  }

  async getToneProfile(id: string): Promise<IToneProfile> {
    return this.request(
      `/profiles/${id}`,
      'GET',
      undefined,
      'Failed to get tone profile',
      'resource',
    );
  }

  async getDefaultToneProfile(): Promise<IToneProfile | null> {
    const response = await fetch(`${this.baseURL}/profiles/default`, {
      headers: { Authorization: `Bearer ${this.token}` },
      method: 'GET',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = new Error('Failed to get default tone profile');
      logger.error('Failed to get default tone profile', { error });
      throw error;
    }

    const json = await response.json();
    return deserializeResource<IToneProfile>(json);
  }

  async createToneProfile(data: Partial<IToneProfile>): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      '/profiles',
      'POST',
      data,
      'Failed to create tone profile',
      'resource',
    );
    logger.info('Tone profile created', { id: profile.id, name: profile.name });
    return profile;
  }

  async updateToneProfile(
    id: string,
    updates: Partial<IToneProfile>,
  ): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      `/profiles/${id}`,
      'PATCH',
      updates,
      'Failed to update tone profile',
      'resource',
    );
    logger.info('Tone profile updated', { id });
    return profile;
  }

  async deleteToneProfile(id: string): Promise<void> {
    await this.request(
      `/profiles/${id}`,
      'DELETE',
      undefined,
      'Failed to delete tone profile',
    );
    logger.info('Tone profile deleted', { id });
  }

  async setAsDefault(id: string): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      `/tone-profiles/${id}/set-default`,
      'POST',
      undefined,
      'Failed to set default tone profile',
    );
    logger.info('Default tone profile set', { id });
    return profile;
  }

  async applyTone(request: IApplyToneRequest): Promise<IApplyToneResult> {
    const result = await this.request<IApplyToneResult>(
      '/tone-profiles/apply',
      'POST',
      request,
      'Failed to apply tone profile',
    );
    logger.info('Tone applied to prompt', {
      consistency: result.estimatedConsistency,
      contentType: request.contentType,
    });
    return result;
  }

  async analyzeTone(
    content: string,
    contentType: 'image' | 'video' | 'voice' | 'article',
    toneProfileId?: string,
  ): Promise<IToneAnalysis> {
    const result = await this.request<IToneAnalysis>(
      '/tone-profiles/analyze',
      'POST',
      { content, contentType, toneProfileId },
      'Failed to analyze tone',
    );
    logger.info('Tone analyzed', { contentType, score: result.score });
    return result;
  }

  async generateFromExamples(
    examples: Array<{
      contentType: 'image' | 'video' | 'voice' | 'article';
      content: string;
      url?: string;
    }>,
    name: string,
    description?: string,
  ): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      '/tone-profiles/generate-from-examples',
      'POST',
      { description, examples, name },
      'Failed to generate tone profile',
    );
    logger.info('Tone profile generated from examples', { id: profile.id });
    return profile;
  }

  async importFromURL(
    url: string,
    platform: string,
    name: string,
  ): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      '/tone-profiles/import-from-url',
      'POST',
      { name, platform, url },
      'Failed to import tone profile',
    );
    logger.info('Tone profile imported from URL', { id: profile.id, url });
    return profile;
  }

  async duplicateToneProfile(id: string, name: string): Promise<IToneProfile> {
    const profile = await this.request<IToneProfile>(
      `/tone-profiles/${id}/duplicate`,
      'POST',
      { name },
      'Failed to duplicate tone profile',
    );
    logger.info('Tone profile duplicated', {
      newId: profile.id,
      originalId: id,
    });
    return profile;
  }
}

export class ProfilesService {
  private static instances: Map<string, ProfilesServiceClass> = new Map();

  static getInstance(token: string): ProfilesServiceClass {
    if (!ProfilesService.instances.has(token)) {
      ProfilesService.instances.set(
        token,
        new ProfilesServiceClass(EnvironmentService.apiEndpoint, token),
      );
    }
    return ProfilesService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    ProfilesService.instances.delete(token);
  }
}
