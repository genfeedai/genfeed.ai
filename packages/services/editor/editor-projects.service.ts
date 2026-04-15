import { EditorProjectStatus, IngredientFormat } from '@genfeedai/enums';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type {
  ICreateEditorProjectDto,
  IEditorProject,
  IEditorProjectSettings,
  IUpdateEditorProjectDto,
} from '@genfeedai/interfaces';
import { getErrorStatus } from '@genfeedai/utils/error/error-handler.util';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

const DEFAULT_FPS = 30;

/**
 * Service for editor project persistence.
 * Calls the backend /editor-projects API for CRUD operations.
 * Falls back to localStorage when the backend is unreachable.
 */
export class EditorProjectsService extends HTTPBaseService {
  private static instances: Map<string, EditorProjectsService> = new Map();

  private constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/editor-projects`, token);
  }

  static getInstance(token: string): EditorProjectsService {
    const existing = EditorProjectsService.instances.get(token);
    if (existing) {
      return existing;
    }

    const instance = new EditorProjectsService(token);
    EditorProjectsService.instances.set(token, instance);
    return instance;
  }

  private normalizeSettings(
    settings?: Partial<IEditorProjectSettings>,
  ): IEditorProjectSettings {
    return {
      backgroundColor: settings?.backgroundColor || '#000000',
      format: settings?.format || IngredientFormat.LANDSCAPE,
      fps: settings?.fps || DEFAULT_FPS,
      height: settings?.height || 1080,
      width: settings?.width || 1920,
    };
  }

  private mapOne(response: JsonApiResponseDocument): IEditorProject {
    const data = deserializeResource<Partial<IEditorProject>>(response);
    return this.normalizeProject(data);
  }

  private mapMany(response: JsonApiResponseDocument): IEditorProject[] {
    const items = deserializeCollection<Partial<IEditorProject>>(response);
    return items.map((item) => this.normalizeProject(item));
  }

  private normalizeProject(data: Partial<IEditorProject>): IEditorProject {
    return {
      brand: data.brand || undefined,
      createdAt: data.createdAt || new Date().toISOString(),
      id: data.id || '',
      isDeleted: data.isDeleted || false,
      name: data.name || 'Untitled Project',
      organization: data.organization || '',
      renderedVideo: data.renderedVideo || undefined,
      settings: this.normalizeSettings(data.settings),
      status: data.status || EditorProjectStatus.DRAFT,
      thumbnailUrl: data.thumbnailUrl || undefined,
      totalDurationFrames: data.totalDurationFrames || DEFAULT_FPS * 10,
      tracks: data.tracks || [],
      updatedAt: data.updatedAt || new Date().toISOString(),
      user: data.user || '',
    };
  }

  /**
   * Create a new editor project
   */
  async create(dto?: ICreateEditorProjectDto): Promise<IEditorProject> {
    const body = {
      name: dto?.name || 'Untitled Project',
      settings: {
        backgroundColor: dto?.settings?.backgroundColor || '#000000',
        format: dto?.settings?.format || IngredientFormat.LANDSCAPE,
        fps: dto?.settings?.fps || DEFAULT_FPS,
        height: dto?.settings?.height || 1080,
        width: dto?.settings?.width || 1920,
      },
      sourceVideoId: dto?.sourceVideoId,
      totalDurationFrames: DEFAULT_FPS * 10,
    };

    const response = await this.instance
      .post<JsonApiResponseDocument>('', body)
      .then((res) => res.data);

    const project = this.mapOne(response);
    logger.info('Created editor project', { projectId: project.id });
    return project;
  }

  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<IEditorProject | null> {
    try {
      const response = await this.instance
        .get<JsonApiResponseDocument>(`/${id}`)
        .then((res) => res.data);

      return this.mapOne(response);
    } catch (error: unknown) {
      if (getErrorStatus(error) === 404) {
        return null;
      }
      logger.error('Failed to find editor project', error);
      return null;
    }
  }

  /**
   * Find all projects for the current user
   */
  async findAll(): Promise<IEditorProject[]> {
    const response = await this.instance
      .get<JsonApiResponseDocument>('', {
        params: { sort: '-updatedAt' },
      })
      .then((res) => res.data);

    return this.mapMany(response);
  }

  /**
   * Update a project
   */
  async update(
    id: string,
    dto: IUpdateEditorProjectDto,
  ): Promise<IEditorProject> {
    const response = await this.instance
      .patch<JsonApiResponseDocument>(`/${id}`, dto)
      .then((res) => res.data);

    const project = this.mapOne(response);
    logger.info('Updated editor project', { projectId: id });
    return project;
  }

  /**
   * Soft delete a project
   */
  async delete(id: string): Promise<void> {
    await this.instance.delete(`/${id}`);
    logger.info('Deleted editor project', { projectId: id });
  }

  /**
   * Start a render job for a project
   */
  async render(id: string): Promise<{ jobId: string }> {
    const response = await this.instance
      .post<JsonApiResponseDocument>(`/${id}/render`)
      .then((res) => res.data);

    const data = deserializeResource<{ id: string }>(response);
    const jobId = data.id;
    logger.info('Render job started', { jobId, projectId: id });
    return { jobId };
  }

  /**
   * Clear all instances (useful for testing)
   */
  static clearInstances(): void {
    EditorProjectsService.instances.clear();
  }
}
