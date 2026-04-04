import { HealthController } from '@libs/health/health.controller';

describe('HealthE2eSpec', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns ok status from check()', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.version).toBeDefined();
  });

  it('returns ready status from ready()', () => {
    const result = controller.ready();

    expect(result.status).toBe('ready');
    expect(result.timestamp).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.version).toBeDefined();
  });

  it('returns alive status from live()', () => {
    const result = controller.live();

    expect(result.status).toBe('alive');
    expect(result.timestamp).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.version).toBeDefined();
  });
});
