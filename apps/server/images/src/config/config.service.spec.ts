import { ConfigService } from '@images/config/config.service';

vi.mock('fs');
vi.mock('dotenv');

describe('ConfigService (Images)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };

    const fs = require('node:fs');
    fs.existsSync = vi.fn().mockReturnValue(false);

    process.env.NODE_ENV = 'test';
    process.env.GENFEEDAI_CDN_URL = 'https://cdn.genfeed.ai';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const service = new ConfigService();
    expect(service).toBeDefined();
  });

  it('should return default COMFYUI_URL when not set', () => {
    delete process.env.COMFYUI_URL;
    const service = new ConfigService();
    expect(service.COMFYUI_URL).toBe('http://localhost:8188');
  });

  it('should return configured COMFYUI_URL when set', () => {
    process.env.COMFYUI_URL = 'http://comfyui:8188';
    const service = new ConfigService();
    expect(service.COMFYUI_URL).toBe('http://comfyui:8188');
  });

  it('should return default REDIS_URL when not set', () => {
    delete process.env.REDIS_URL;
    const service = new ConfigService();
    expect(service.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('should return configured REDIS_URL when set', () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    const service = new ConfigService();
    expect(service.REDIS_URL).toBe('redis://redis:6379');
  });

  it('should return empty string for API_KEY when not set', () => {
    delete process.env.GENFEEDAI_API_KEY;
    const service = new ConfigService();
    expect(service.API_KEY).toBe('');
  });

  it('should return configured API_KEY when set', () => {
    process.env.GENFEEDAI_API_KEY = 'images-api-key';
    const service = new ConfigService();
    expect(service.API_KEY).toBe('images-api-key');
  });

  it('should return default TRAINING_BINARY_PATH when not set', () => {
    delete process.env.TRAINING_BINARY_PATH;
    const service = new ConfigService();
    expect(service.TRAINING_BINARY_PATH).toBe('/usr/local/bin/accelerate');
  });

  it('should return configured TRAINING_BINARY_PATH when set', () => {
    process.env.TRAINING_BINARY_PATH = '/opt/accelerate/bin';
    const service = new ConfigService();
    expect(service.TRAINING_BINARY_PATH).toBe('/opt/accelerate/bin');
  });

  it('should return default COMFYUI_LORAS_PATH when not set', () => {
    delete process.env.COMFYUI_LORAS_PATH;
    const service = new ConfigService();
    expect(service.COMFYUI_LORAS_PATH).toBe('/comfyui/models/loras');
  });

  it('should return default DATASETS_PATH when not set', () => {
    delete process.env.DATASETS_PATH;
    const service = new ConfigService();
    expect(service.DATASETS_PATH).toBe('/datasets');
  });

  it('should return default AWS_REGION when not set', () => {
    delete process.env.AWS_REGION;
    const service = new ConfigService();
    expect(service.AWS_REGION).toBe('us-east-1');
  });

  it('should detect development environment', () => {
    process.env.NODE_ENV = 'development';
    const service = new ConfigService();
    expect(service.isDevelopment).toBe(true);
    expect(service.isProduction).toBe(false);
  });

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production';
    const service = new ConfigService();
    expect(service.isProduction).toBe(true);
    expect(service.isDevelopment).toBe(false);
  });
});
