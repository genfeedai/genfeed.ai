import process from 'node:process';
import { ConfigService } from '@videos/config/config.service';

vi.mock('fs');
vi.mock('dotenv');

describe('ConfigService (Videos)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };

    const fs = require('node:fs');
    fs.existsSync = vi.fn().mockReturnValue(false);

    process.env.NODE_ENV = 'test';
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

  it('should return default COMFYUI_OUTPUT_PATH when not set', () => {
    delete process.env.COMFYUI_OUTPUT_PATH;
    const service = new ConfigService();
    expect(service.COMFYUI_OUTPUT_PATH).toBe('/opt/ComfyUI/output');
  });

  it('should return configured COMFYUI_OUTPUT_PATH when set', () => {
    process.env.COMFYUI_OUTPUT_PATH = '/custom/comfy/output';
    const service = new ConfigService();
    expect(service.COMFYUI_OUTPUT_PATH).toBe('/custom/comfy/output');
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
    process.env.GENFEEDAI_API_KEY = 'videos-api-key';
    const service = new ConfigService();
    expect(service.API_KEY).toBe('videos-api-key');
  });

  it('should return empty string for AWS_ACCESS_KEY_ID when not set', () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    const service = new ConfigService();
    expect(service.AWS_ACCESS_KEY_ID).toBe('');
  });

  it('should return configured AWS_ACCESS_KEY_ID when set', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIA-TEST';
    const service = new ConfigService();
    expect(service.AWS_ACCESS_KEY_ID).toBe('AKIA-TEST');
  });

  it('should return empty string for AWS_SECRET_ACCESS_KEY when not set', () => {
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const service = new ConfigService();
    expect(service.AWS_SECRET_ACCESS_KEY).toBe('');
  });

  it('should return configured AWS_SECRET_ACCESS_KEY when set', () => {
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-test';
    const service = new ConfigService();
    expect(service.AWS_SECRET_ACCESS_KEY).toBe('secret-test');
  });

  it('should return default AWS_REGION when not set', () => {
    delete process.env.AWS_REGION;
    const service = new ConfigService();
    expect(service.AWS_REGION).toBe('us-east-1');
  });

  it('should return configured AWS_REGION when set', () => {
    process.env.AWS_REGION = 'eu-west-1';
    const service = new ConfigService();
    expect(service.AWS_REGION).toBe('eu-west-1');
  });

  it('should return empty string for AWS_S3_BUCKET when not set', () => {
    delete process.env.AWS_S3_BUCKET;
    const service = new ConfigService();
    expect(service.AWS_S3_BUCKET).toBe('');
  });

  it('should return configured AWS_S3_BUCKET when set', () => {
    process.env.AWS_S3_BUCKET = 'videos-bucket';
    const service = new ConfigService();
    expect(service.AWS_S3_BUCKET).toBe('videos-bucket');
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
