import { HealthController } from '@images/controllers/health.controller';
import { JobService } from '@images/services/job.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('HealthController (images)', () => {
  let controller: HealthController;
  let jobService: { getStats: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: JobService,
          useValue: {
            getStats: vi.fn().mockReturnValue({
              active: 1,
              completed: 5,
              failed: 0,
              queued: 2,
              total: 8,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
    jobService = module.get(JobService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('returns status ok', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
    });

    it('returns service name as images', () => {
      const result = controller.getHealth();
      expect(result.service).toBe('images');
    });

    it('includes job stats from JobService', () => {
      const result = controller.getHealth();
      expect(result.jobs).toEqual({
        active: 1,
        completed: 5,
        failed: 0,
        queued: 2,
        total: 8,
      });
      expect(jobService.getStats).toHaveBeenCalledTimes(1);
    });

    it('includes memory usage fields', () => {
      const result = controller.getHealth();
      expect(result.memory).toHaveProperty('heapUsed');
      expect(result.memory).toHaveProperty('heapTotal');
      expect(result.memory).toHaveProperty('rss');
    });

    it('includes a valid ISO timestamp', () => {
      const result = controller.getHealth();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('includes uptime as a number', () => {
      const result = controller.getHealth();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('calls getStats exactly once per request', () => {
      controller.getHealth();
      expect(jobService.getStats).toHaveBeenCalledTimes(1);
    });

    it('reflects updated stats on subsequent calls', () => {
      jobService.getStats.mockReturnValueOnce({
        active: 0,
        completed: 10,
        failed: 1,
        queued: 0,
        total: 11,
      });
      const result = controller.getHealth();
      expect(result.jobs.completed).toBe(10);
    });
  });
});
