import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateCronJobInput,
  CronJobsService,
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

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
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

  it('create POSTs new cron job', async () => {
    const input: CreateCronJobInput = {
      jobType: 'workflow_execution',
      name: 'Daily Report',
      schedule: '0 8 * * *',
    };
    mockInstance.post.mockResolvedValue({ data: { data: makeCronJob() } });

    await service.create(input);

    expect(mockInstance.post).toHaveBeenCalledWith('', input);
  });

  it('update PATCHes a cron job by id', async () => {
    const patch: UpdateCronJobInput = { enabled: false };
    mockInstance.patch.mockResolvedValue({
      data: { data: makeCronJob('cron-99') },
    });

    await service.update('cron-99', patch);

    expect(mockInstance.patch).toHaveBeenCalledWith('/cron-99', patch);
  });

  it('pause POSTs to /:id/pause', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: makeCronJob() } });

    await service.pause('cron-1');

    expect(mockInstance.post).toHaveBeenCalledWith('/cron-1/pause');
  });

  it('resume POSTs to /:id/resume', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: makeCronJob() } });

    await service.resume('cron-1');

    expect(mockInstance.post).toHaveBeenCalledWith('/cron-1/resume');
  });

  it('runNow POSTs to /:id/run-now and returns a CronRunRecord', async () => {
    const runRecord = {
      cronJob: 'cron-1',
      id: 'run-1',
      status: 'queued',
      trigger: 'manual',
    };
    mockInstance.post.mockResolvedValue({ data: { data: runRecord } });

    const result = await service.runNow('cron-1');

    expect(mockInstance.post).toHaveBeenCalledWith('/cron-1/run-now');
    expect(result).toBeDefined();
  });

  it('delete DELETEs a cron job by id', async () => {
    mockInstance.delete.mockResolvedValue({ data: { data: makeCronJob() } });

    await service.delete('cron-2');

    expect(mockInstance.delete).toHaveBeenCalledWith('/cron-2');
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

  it('testWebhook POSTs to /test-webhook', async () => {
    const webhookInput = {
      webhookSecret: 's3cr3t',
      webhookUrl: 'https://example.com/hook',
    };
    mockInstance.post.mockResolvedValue({ data: { success: true } });

    await service.testWebhook(webhookInput);

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/test-webhook',
      webhookInput,
    );
  });
});
