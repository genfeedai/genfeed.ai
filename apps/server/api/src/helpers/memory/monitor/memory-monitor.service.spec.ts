import { ConfigService } from '@api/config/config.service';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock v8 module
vi.mock('node:v8', () => ({
  default: {
    getHeapStatistics: vi.fn(() => ({
      heap_size_limit: 4294967296, // 4GB
      total_heap_size: 2147483648,
      used_heap_size: 1073741824,
    })),
  },
  getHeapStatistics: vi.fn(() => ({
    heap_size_limit: 4294967296, // 4GB
    total_heap_size: 2147483648,
    used_heap_size: 1073741824,
  })),
}));

describe('MemoryMonitorService', () => {
  let service: MemoryMonitorService;
  const originalEnv = process.env;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
    ingredientsEndpoint: 'http://localhost:3002/ingredients',
    isDevelopment: false,
    isProduction: false,
    isStaging: false,
  } as unknown as ConfigService;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test'; // Prevent auto-start in tests

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryMonitorService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MemoryMonitorService>(MemoryMonitorService);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should not start monitoring in test environment', () => {
      // Verify no interval was started (isDevelopment is false)
      expect(service['monitorInterval']).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop monitoring on module destroy', () => {
      service.onModuleDestroy();
      expect(service['monitorInterval']).toBeNull();
    });
  });

  describe('memory monitoring', () => {
    it('should have warning and critical thresholds', () => {
      expect(service['warningThreshold']).toBe(0.8);
      expect(service['criticalThreshold']).toBe(0.9);
    });

    it('should have max heap size set', () => {
      expect(service['maxHeapSize']).toBeDefined();
      expect(service['maxHeapSize']).toBeGreaterThan(0);
    });
  });
});
