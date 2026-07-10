import { HealthController } from '@libs/health/health.controller';
import { HEALTH_CONTRIBUTOR } from '@libs/health/health-contributor.interface';
import { Test, type TestingModule } from '@nestjs/testing';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status without sensitive data', () => {
      const result = controller.check();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('version');
      expect(result).not.toHaveProperty('memory');
      expect(result).not.toHaveProperty('uptime');
    });

    it('should return different timestamps on multiple calls', async () => {
      const result1 = controller.check();

      await new Promise((resolve) => setTimeout(resolve, 1));

      const result2 = controller.check();

      expect(result1.timestamp).not.toBe(result2.timestamp);
    });
  });

  describe('detailed', () => {
    it('should return health status with memory and uptime', async () => {
      const result = await controller.detailed();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('memory');

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);

      expect(typeof result.memory).toBe('object');
      expect(result.memory).toHaveProperty('rss');
      expect(result.memory).toHaveProperty('heapTotal');
      expect(result.memory).toHaveProperty('heapUsed');
      expect(result.memory).toHaveProperty('external');
      expect(result.memory).toHaveProperty('arrayBuffers');
    });

    it('should return increasing uptime values', async () => {
      const result1 = await controller.detailed();

      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait
      }

      const result2 = await controller.detailed();

      expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime as number);
    });

    it('should return memory usage information', async () => {
      const result = await controller.detailed();

      expect(result.memory).toBeDefined();
      expect(typeof result.memory).toBe('object');
      expect(typeof result.memory?.rss).toBe('number');
      expect(typeof result.memory?.heapTotal).toBe('number');
      expect(typeof result.memory?.heapUsed).toBe('number');
    });
  });

  describe('contributor', () => {
    it('merges contributor details into detailed() only', async () => {
      const moduleWithContributor: TestingModule =
        await Test.createTestingModule({
          controllers: [HealthController],
          providers: [
            {
              provide: HEALTH_CONTRIBUTOR,
              useValue: {
                getHealthDetails: () => ({ activeBots: 3 }),
              },
            },
          ],
        }).compile();

      const withContributor =
        moduleWithContributor.get<HealthController>(HealthController);

      const detailed = await withContributor.detailed();
      expect(detailed).toHaveProperty('activeBots', 3);

      expect(withContributor.check()).not.toHaveProperty('activeBots');
    });

    it('awaits async contributor details', async () => {
      const moduleWithAsync: TestingModule = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          {
            provide: HEALTH_CONTRIBUTOR,
            useValue: {
              getHealthDetails: async () => ({
                jobs: { active: 1, queued: 2 },
              }),
            },
          },
        ],
      }).compile();

      const withAsync = moduleWithAsync.get<HealthController>(HealthController);

      const detailed = await withAsync.detailed();
      expect(detailed.jobs).toEqual({ active: 1, queued: 2 });
    });

    it('does not throw when no contributor is bound', async () => {
      const detailed = await controller.detailed();
      expect(detailed).toHaveProperty('status', 'ok');
      expect(detailed).not.toHaveProperty('activeBots');
    });
  });

  describe('ready', () => {
    it('should return ready status', () => {
      const result = controller.ready();
      expect(result).toHaveProperty('status', 'ready');
    });
  });

  describe('live', () => {
    it('should return alive status', () => {
      const result = controller.live();
      expect(result).toHaveProperty('status', 'alive');
    });
  });
});
