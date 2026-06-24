import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateCronJobInput,
  CronJobsService,
  LEGACY_CRON_JOBS_RETIRED_MESSAGE,
  type UpdateCronJobInput,
} from './cron-jobs.service';

vi.mock('@services/core/interceptor.service', () => {
  return {
    HTTPBaseService: class {
      protected instance: {
        get: ReturnType<typeof vi.fn>;
        post: ReturnType<typeof vi.fn>;
        patch: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      constructor(_baseUrl: string, _token: string) {
        this.instance = {
          delete: vi.fn(),
          get: vi.fn(),
          patch: vi.fn(),
          post: vi.fn(),
        };
      }
      static getBaseServiceInstance(
        Cls: new (token: string) => CronJobsService,
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

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: vi.fn((doc) => doc?.data ?? []),
  deserializeResource: vi.fn((doc) => doc?.data ?? doc),
}));

const makeCronJob = (id = 'cron-1') => ({
  consecutiveFailures: 0,
  enabled: true,
  id,
  jobType: 'workflow_execution' as const,
  lastStatus: 'never' as const,
  maxRetries: 3,
  name: 'My Cron',
  payload: {},
  retryBackoffMinutes: 5,
  schedule: '0 * * * *',
  timezone: 'UTC',
});

describe('CronJobsService', () => {
  let service: CronJobsService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = new CronJobsService('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('list GETs all cron jobs', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [makeCronJob()] } });

    const result = await service.list();

    expect(mockInstance.get).toHaveBeenCalledWith('');
    expect(result).toBeDefined();
  });

  it('rejects create without calling the legacy API', async () => {
    const input: CreateCronJobInput = {
      jobType: 'workflow_execution',
      name: 'Daily Report',
      schedule: '0 8 * * *',
    };

    await expect(service.create(input)).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('rejects update without calling the legacy API', async () => {
    const patch: UpdateCronJobInput = { enabled: false };

    await expect(service.update('cron-99', patch)).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.patch).not.toHaveBeenCalled();
  });

  it('rejects pause without calling the legacy API', async () => {
    await expect(service.pause('cron-1')).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('rejects resume without calling the legacy API', async () => {
    await expect(service.resume('cron-1')).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('rejects runNow without calling the legacy API', async () => {
    await expect(service.runNow('cron-1')).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('rejects delete without calling the legacy API', async () => {
    await expect(service.delete('cron-2')).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.delete).not.toHaveBeenCalled();
  });

  it('runs GETs run history for a cron job', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [] } });

    await service.runs('cron-1');

    expect(mockInstance.get).toHaveBeenCalledWith('/cron-1/runs');
  });

  it('run GETs a specific run by id', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: { id: 'run-5' } } });

    await service.run('cron-1', 'run-5');

    expect(mockInstance.get).toHaveBeenCalledWith('/cron-1/runs/run-5');
  });

  it('rejects testWebhook without calling the legacy API', async () => {
    const webhookInput = {
      webhookSecret: 'placeholder-secret',
      webhookUrl: 'https://example.com/hook',
    };

    await expect(service.testWebhook(webhookInput)).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(mockInstance.post).not.toHaveBeenCalled();
  });
});
