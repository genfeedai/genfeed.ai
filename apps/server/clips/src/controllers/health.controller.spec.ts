import { HealthController } from '@clips/controllers/health.controller';
import { Test, TestingModule } from '@nestjs/testing';

describe('HealthController (clips)', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('returns status ok', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
    });

    it('returns service name as clips', () => {
      const result = controller.getHealth();
      expect(result.service).toBe('clips');
    });

    it('includes a valid ISO timestamp', () => {
      const result = controller.getHealth();
      expect(result.timestamp).toBeDefined();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('returns a fresh timestamp each call', async () => {
      const first = controller.getHealth();
      await new Promise((r) => setTimeout(r, 5));
      const second = controller.getHealth();
      expect(first.timestamp).not.toBe(second.timestamp);
    });

    it('returns an object with the expected shape', () => {
      const result = controller.getHealth();
      expect(result).toMatchObject({
        service: 'clips',
        status: 'ok',
      });
      expect(typeof result.timestamp).toBe('string');
    });
  });
});
