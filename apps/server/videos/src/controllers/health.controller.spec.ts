import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@videos/controllers/health.controller';
import { JobService } from '@videos/services/job.service';

describe('HealthController (videos)', () => {
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
              active: 2,
              completed: 7,
              failed: 1,
              queued: 3,
              total: 13,
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

    it('returns service name as videos', () => {
      const result = controller.getHealth();
      expect(result.service).toBe('videos');
    });

    it('includes job stats from JobService', () => {
      const result = controller.getHealth();
      expect(result.jobs).toEqual({
        active: 2,
        completed: 7,
        failed: 1,
        queued: 3,
        total: 13,
      });
    });

    it('calls getStats once per request', () => {
      controller.getHealth();
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
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('includes uptime as a non-negative number', () => {
      const result = controller.getHealth();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reflects updated stats on subsequent calls', () => {
      jobService.getStats.mockReturnValueOnce({
        active: 0,
        completed: 20,
        failed: 0,
        queued: 0,
        total: 20,
      });
      const result = controller.getHealth();
      expect(result.jobs.total).toBe(20);
    });
  });
});
