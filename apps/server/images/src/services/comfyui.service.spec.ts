import { ConfigService } from '@images/config/config.service';
import { ComfyUIService } from '@images/services/comfyui.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

import axios from 'axios';

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
};

describe('ComfyUIService', () => {
  let service: ComfyUIService;
  let configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;

  beforeEach(async () => {
    const mockConfigService = {
      COMFYUI_URL: 'http://localhost:8188',
    } as unknown as Mocked<ConfigService>;

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComfyUIService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ComfyUIService>(ComfyUIService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return online when ComfyUI responds', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 200 });

      const result = await service.getStatus();

      expect(result).toEqual({
        status: 'online',
        url: 'http://localhost:8188',
      });
    });

    it('should return offline when ComfyUI does not respond', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.getStatus();

      expect(result).toEqual({
        status: 'offline',
        url: 'http://localhost:8188',
      });
    });

    it('should call the configured ComfyUI URL', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 200 });

      await service.getStatus();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8188', {
        timeout: 5000,
      });
    });

    it('should log a warning when offline', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('EHOSTUNREACH'));

      await service.getStatus();

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'ComfyUI is offline' }),
      );
    });

    it('should include the URL in the offline warning', async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error('timeout'));

      await service.getStatus();

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ url: 'http://localhost:8188' }),
      );
    });

    it('should not warn when online', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ status: 200 });

      await service.getStatus();

      expect(loggerService.warn).not.toHaveBeenCalled();
    });
  });

  describe('restart', () => {
    it('should return a restart signal message', async () => {
      const result = await service.restart();

      expect(result).toEqual({ message: 'ComfyUI restart signal sent' });
    });

    it('should log the restart request', async () => {
      await service.restart();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'Restart requested' }),
      );
    });

    it('should not make any HTTP calls (restart handled by orchestrator)', async () => {
      mockedAxios.get = vi.fn();

      await service.restart();

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });
});
