import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDarkroomService } from './darkroom.service';

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
      static getBaseServiceInstance(
        Cls: new (token: string) => AdminDarkroomService,
        token: string,
      ) {
        return new Cls(token);
      }
    },
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn((doc) => doc?.data ?? []),
  deserializeResource: vi.fn((doc) => doc?.data ?? doc),
}));

const mockCharacter = { id: 'char-1', name: 'Maya', slug: 'maya' };
const mockTraining = { id: 'train-1', personaSlug: 'maya', status: 'queued' };
const mockJob = {
  createdAt: '2026-01-01T00:00:00Z',
  jobId: 'job-1',
  model: 'sdxl',
  personaSlug: 'maya',
  progress: 0,
  prompt: 'test',
  stage: 'init',
  status: 'queued' as const,
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('AdminDarkroomService', () => {
  let service: AdminDarkroomService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = new AdminDarkroomService('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getCharacters GETs /characters', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [mockCharacter] } });

    await service.getCharacters();

    expect(mockInstance.get).toHaveBeenCalledWith('/characters');
  });

  it('getCharacter GETs /characters/:slug', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: mockCharacter } });

    await service.getCharacter('maya');

    expect(mockInstance.get).toHaveBeenCalledWith('/characters/maya');
  });

  it('createCharacter POSTs to /characters', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: mockCharacter } });

    await service.createCharacter({ name: 'Maya' });

    expect(mockInstance.post).toHaveBeenCalledWith('/characters', {
      name: 'Maya',
    });
  });

  it('updateCharacter PATCHes /characters/:slug', async () => {
    mockInstance.patch.mockResolvedValue({ data: { data: mockCharacter } });

    await service.updateCharacter('maya', { name: 'Maya Updated' });

    expect(mockInstance.patch).toHaveBeenCalledWith('/characters/maya', {
      name: 'Maya Updated',
    });
  });

  it('deleteCharacter DELETEs /characters/:slug', async () => {
    mockInstance.delete.mockResolvedValue({ data: { data: mockCharacter } });

    await service.deleteCharacter('maya');

    expect(mockInstance.delete).toHaveBeenCalledWith('/characters/maya');
  });

  it('getTrainings GETs /trainings with optional slug filter', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [mockTraining] } });

    await service.getTrainings('maya');

    expect(mockInstance.get).toHaveBeenCalledWith('/trainings', {
      params: { personaSlug: 'maya' },
    });
  });

  it('getTrainings GETs /trainings without filter when no slug', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [] } });

    await service.getTrainings();

    expect(mockInstance.get).toHaveBeenCalledWith('/trainings', { params: {} });
  });

  it('startTraining POSTs to /trainings with data', async () => {
    const trainingData = {
      label: 'v2',
      personaSlug: 'maya',
      sourceIds: ['src-1', 'src-2'],
      steps: 1000,
    };
    mockInstance.post.mockResolvedValue({ data: { data: mockTraining } });

    await service.startTraining(trainingData);

    expect(mockInstance.post).toHaveBeenCalledWith('/trainings', trainingData);
  });

  it('createGenerationJob POSTs to /generate/jobs', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: mockJob } });

    await service.createGenerationJob({
      personaSlug: 'maya',
      prompt: 'beautiful portrait',
    });

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/generate/jobs',
      expect.objectContaining({
        personaSlug: 'maya',
        prompt: 'beautiful portrait',
      }),
    );
  });

  it('getGenerationJob GETs /generate/jobs/:jobId', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: mockJob } });

    await service.getGenerationJob('job-1');

    expect(mockInstance.get).toHaveBeenCalledWith('/generate/jobs/job-1');
  });

  it('ec2Action POSTs to /infrastructure/ec2/action', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: { message: 'ok' } } });

    await service.ec2Action('i-123', 'start');

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/infrastructure/ec2/action',
      { action: 'start', instanceId: 'i-123' },
    );
  });

  it('getFleetHealth GETs /infrastructure/fleet/health', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: { healthy: true } } });

    await service.getFleetHealth();

    expect(mockInstance.get).toHaveBeenCalledWith(
      '/infrastructure/fleet/health',
    );
  });

  it('generateLipSync POSTs to /lip-sync', async () => {
    mockInstance.post.mockResolvedValue({
      data: { data: { jobId: 'ls-1', status: 'queued' } },
    });

    await service.generateLipSync({
      imageUrl: 'https://cdn.example.com/img.jpg',
      personaSlug: 'maya',
      text: 'Hello world',
    });

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/lip-sync',
      expect.any(Object),
    );
  });

  it('getLipSyncStatus GETs /lip-sync/:jobId', async () => {
    mockInstance.get.mockResolvedValue({
      data: { data: { status: 'processing' } },
    });

    await service.getLipSyncStatus('ls-1');

    expect(mockInstance.get).toHaveBeenCalledWith('/lip-sync/ls-1');
  });

  it('generateVoice POSTs to /voices/generate', async () => {
    mockInstance.post.mockResolvedValue({
      data: { data: { audioUrl: 'https://cdn.example.com/audio.mp3' } },
    });

    await service.generateVoice({ text: 'Hello', voiceId: 'voice-1' });

    expect(mockInstance.post).toHaveBeenCalledWith('/voices/generate', {
      text: 'Hello',
      voiceId: 'voice-1',
    });
  });
});
