import { HealthController } from '@libs/health/health.controller';
import { Test, TestingModule } from '@nestjs/testing';

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
    it('should return health status with memory and uptime', () => {
      const result = controller.detailed();

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

    it('should return increasing uptime values', () => {
      const result1 = controller.detailed();

      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait
      }

      const result2 = controller.detailed();

      expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime);
    });

    it('should return memory usage information', () => {
      const result = controller.detailed();

      expect(result.memory).toBeDefined();
      expect(typeof result.memory).toBe('object');
      expect(typeof result.memory.rss).toBe('number');
      expect(typeof result.memory.heapTotal).toBe('number');
      expect(typeof result.memory.heapUsed).toBe('number');
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
