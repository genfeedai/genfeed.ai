import { HealthController } from '@libs/health/health.controller';

describe('HealthController (library)', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns consistent health payload with mocked metrics', () => {
    const fixedDate = new Date('2024-01-01T00:00:00.000Z');
    vi.useFakeTimers().setSystemTime(fixedDate);

    const uptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(42);
    const memoryUsage = {
      arrayBuffers: 5,
      external: 4,
      heapTotal: 2,
      heapUsed: 3,
      rss: 1,
    } as NodeJS.MemoryUsage;
    const memorySpy = vi
      .spyOn(process, 'memoryUsage')
      .mockReturnValue(memoryUsage);

    const result = controller.detailed();

    expect(uptimeSpy).toHaveBeenCalledTimes(1);
    expect(memorySpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      memory: memoryUsage,
      service: 'api',
      status: 'ok',
      timestamp: fixedDate.toISOString(),
      uptime: 42,
      version: expect.any(String),
    });
  });

  it('emits new timestamps for different invocations', () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({} as NodeJS.MemoryUsage);
    vi.spyOn(process, 'uptime').mockReturnValue(1);

    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const firstTimestamp = controller.check().timestamp;

    vi.setSystemTime(new Date('2024-01-01T00:05:00.000Z'));
    const secondTimestamp = controller.check().timestamp;

    expect(firstTimestamp).not.toEqual(secondTimestamp);
    expect(new Date(secondTimestamp).getTime()).toBeGreaterThan(
      new Date(firstTimestamp).getTime(),
    );
  });

  it('check() returns status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
  });

  it('ready() returns status ready', () => {
    const result = controller.ready();
    expect(result.status).toBe('ready');
  });

  it('live() returns status alive', () => {
    const result = controller.live();
    expect(result.status).toBe('alive');
  });

  it('detailed() includes memory and uptime fields', () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 100,
      heapUsed: 50,
      rss: 200,
    } as NodeJS.MemoryUsage);
    vi.spyOn(process, 'uptime').mockReturnValue(99);

    const result = controller.detailed();
    expect(result.memory).toBeDefined();
    expect(result.uptime).toBe(99);
    expect(result.memory?.heapUsed).toBe(50);
  });

  it('uses VERSION env when npm_package_version is absent', () => {
    const origVersion = process.env.npm_package_version;
    const origServiceVersion = process.env.VERSION;
    delete process.env.npm_package_version;
    process.env.VERSION = '2.5.0';

    const result = controller.check();
    expect(result.version).toBe('2.5.0');

    if (origVersion !== undefined)
      process.env.npm_package_version = origVersion;
    else delete process.env.npm_package_version;
    if (origServiceVersion !== undefined)
      process.env.VERSION = origServiceVersion;
    else delete process.env.VERSION;
  });
});
