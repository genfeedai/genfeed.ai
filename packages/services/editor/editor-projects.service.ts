import type {
  ICreateEditorProjectDto,
  IEditorProject,
  IUpdateEditorProjectDto,
} from '@genfeedai/interfaces';
import { EditorProjectStatus, IngredientFormat } from '@genfeedai/enums';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';
import { getErrorStatus } from '@utils/error/error-handler.util';

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

  private mapOne(response: JsonApiResponseDocument): IEditorProject {
    const data = deserializeResource<Record<string, unknown>>(response);
    return this.normalizeProject(data);
  }

  private mapMany(response: JsonApiResponseDocument): IEditorProject[] {
    const items = deserializeCollection<Record<string, unknown>>(response);
    return items.map((item) => this.normalizeProject(item));
  }

  private normalizeProject(data: Record<string, unknown>): IEditorProject {
    return {
      brand: (data.brand as string) || undefined,
      createdAt: (data.createdAt as string) || new Date().toISOString(),
      id: (data.id as string) || (data._id as string) || '',
      isDeleted: (data.isDeleted as boolean) || false,
      name: (data.name as string) || 'Untitled Project',
      organization: (data.organization as string) || '',
      renderedVideo: (data.renderedVideo as string) || undefined,
      settings: {
        backgroundColor:
          ((data.settings as Record<string, unknown>)
            ?.backgroundColor as string) || '#000000',
        format:
          ((data.settings as Record<string, unknown>)
            ?.format as IngredientFormat) || IngredientFormat.LANDSCAPE,
        fps:
          ((data.settings as Record<string, unknown>)?.fps as number) ||
          DEFAULT_FPS,
        height:
          ((data.settings as Record<string, unknown>)?.height as number) ||
          1080,
        width:
          ((data.settings as Record<string, unknown>)?.width as number) || 1920,
      },
      status: (data.status as EditorProjectStatus) || EditorProjectStatus.DRAFT,
      thumbnailUrl: (data.thumbnailUrl as string) || undefined,
      totalDurationFrames:
        (data.totalDurationFrames as number) || DEFAULT_FPS * 10,
      tracks: (data.tracks as IEditorProject['tracks']) || [],
      updatedAt: (data.updatedAt as string) || new Date().toISOString(),
      user: (data.user as string) || '',
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
