import { EditorProjectStatus, IngredientFormat } from '@genfeedai/enums';
import type { IEditorProject } from '@genfeedai/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorProjectsService } from './editor-projects.service';

vi.mock('@services/core/interceptor.service', () => {
  return {
    HTTPBaseService: class {
      protected instance: {
        get: ReturnType<typeof vi.fn>;
        post: ReturnType<typeof vi.fn>;
        patch: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_baseUrl: string, _token: string) {
        this.instance = {
          delete: vi.fn(),
          get: vi.fn(),
          patch: vi.fn(),
          post: vi.fn(),
        };
      }
    },
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn((doc) =>
    Array.isArray(doc) ? doc : (doc?.data ?? []),
  ),
  deserializeResource: vi.fn((doc) => doc?.data ?? doc),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@utils/error/error-handler.util', () => ({
  getErrorStatus: vi.fn((err) => (err as { status?: number })?.status ?? 500),
}));

const makeProjectPayload = (id = 'proj-1'): Record<string, unknown> => ({
  createdAt: '2026-01-01T00:00:00Z',
  id,
  name: 'Test Project',
  organization: 'org-1',
  settings: {
    backgroundColor: '#000000',
    format: IngredientFormat.LANDSCAPE,
    fps: 30,
    height: 1080,
    width: 1920,
  },
  status: EditorProjectStatus.DRAFT,
  totalDurationFrames: 300,
  tracks: [],
  updatedAt: '2026-01-01T00:00:00Z',
  user: 'user-1',
});

describe('EditorProjectsService', () => {
  let service: EditorProjectsService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    EditorProjectsService.clearInstances();
    service = EditorProjectsService.getInstance('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getInstance returns same instance for same token', () => {
    const a = EditorProjectsService.getInstance('tok');
    const b = EditorProjectsService.getInstance('tok');
    expect(a).toBe(b);
  });

  it('getInstance returns different instances for different tokens', () => {
    const a = EditorProjectsService.getInstance('token-a');
    const b = EditorProjectsService.getInstance('token-b');
    expect(a).not.toBe(b);
  });

  it('create POSTs with defaults when no dto provided', async () => {
    mockInstance.post.mockResolvedValue({ data: makeProjectPayload() });

    const result = await service.create();

    expect(mockInstance.post).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        name: 'Untitled Project',
        settings: expect.objectContaining({ fps: 30 }),
      }),
    );
    expect(result).toBeDefined();
  });

  it('create POSTs with provided dto values', async () => {
    mockInstance.post.mockResolvedValue({
      data: makeProjectPayload('proj-custom'),
    });

    await service.create({
      name: 'My Movie',
      settings: {
        backgroundColor: '#fff',
        format: IngredientFormat.PORTRAIT,
        fps: 24,
        height: 1920,
        width: 1080,
      },
    });

    expect(mockInstance.post).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        name: 'My Movie',
        settings: expect.objectContaining({
          format: IngredientFormat.PORTRAIT,
          fps: 24,
        }),
      }),
    );
  });

  it('findById returns a project for a valid id', async () => {
    mockInstance.get.mockResolvedValue({ data: makeProjectPayload('proj-5') });

    const result = await service.findById('proj-5');

    expect(mockInstance.get).toHaveBeenCalledWith('/proj-5');
    expect(result).not.toBeNull();
  });

  it('findById returns null on 404', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    mockInstance.get.mockRejectedValue(err);

    const result = await service.findById('proj-missing');

    expect(result).toBeNull();
  });

  it('findById returns null on other errors and logs', async () => {
    mockInstance.get.mockRejectedValue(new Error('Internal'));

    const result = await service.findById('proj-error');

    expect(result).toBeNull();
  });

  it('findAll GETs with sort param', async () => {
    mockInstance.get.mockResolvedValue({ data: [] });

    await service.findAll();

    expect(mockInstance.get).toHaveBeenCalledWith('', {
      params: { sort: '-updatedAt' },
    });
  });

  it('update PATCHes the project', async () => {
    mockInstance.patch.mockResolvedValue({
      data: makeProjectPayload('proj-9'),
    });

    await service.update('proj-9', { name: 'Updated Name' });

    expect(mockInstance.patch).toHaveBeenCalledWith('/proj-9', {
      name: 'Updated Name',
    });
  });

  it('delete DELETEs the project', async () => {
    mockInstance.delete.mockResolvedValue({});

    await service.delete('proj-del');

    expect(mockInstance.delete).toHaveBeenCalledWith('/proj-del');
  });

  it('render POSTs to /:id/render and returns jobId', async () => {
    mockInstance.post.mockResolvedValue({
      data: { data: { id: 'job-render-1' } },
    });

    const result = await service.render('proj-render');

    expect(mockInstance.post).toHaveBeenCalledWith('/proj-render/render');
    expect(result).toEqual({ jobId: 'job-render-1' });
  });

  it('normalizeProject fills in defaults for missing fields', async () => {
    mockInstance.post.mockResolvedValue({ data: {} });

    const result = await service.create();

    const project = result as IEditorProject;
    expect(project.name).toBe('Untitled Project');
    expect(project.status).toBe(EditorProjectStatus.DRAFT);
    expect(project.settings.fps).toBe(30);
    expect(project.tracks).toEqual([]);
  });
});
