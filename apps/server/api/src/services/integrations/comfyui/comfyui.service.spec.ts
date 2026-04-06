vi.mock('@genfeedai/workflows', () => ({
  buildFlux2DevPrompt: vi.fn(() => ({ nodes: 'flux2-dev' })),
  buildFlux2DevPulidLoraPrompt: vi.fn(() => ({
    nodes: 'flux2-dev-pulid-lora',
  })),
  buildFlux2DevPulidPrompt: vi.fn(() => ({ nodes: 'flux2-dev-pulid' })),
  buildFlux2DevPulidUpscalePrompt: vi.fn(() => ({
    nodes: 'flux2-dev-pulid-upscale',
  })),
  buildFlux2KleinPrompt: vi.fn(() => ({ nodes: 'flux2-klein' })),
  buildFluxDevPrompt: vi.fn(() => ({ nodes: 'flux-dev' })),
  buildPulidFluxPrompt: vi.fn(() => ({ nodes: 'pulid-flux' })),
  buildZImageTurboLoraPrompt: vi.fn(() => ({ nodes: 'z-image-turbo-lora' })),
  buildZImageTurboPrompt: vi.fn(() => ({ nodes: 'z-image-turbo' })),
}));

import type { ConfigService } from '@api/config/config.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('ComfyUIService', () => {
  let service: ComfyUIService;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let loggerMock: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const COMFYUI_URL = 'http://comfyui.local:8188';

  beforeEach(() => {
    vi.clearAllMocks();

    httpGetMock = vi.fn();
    httpPostMock = vi.fn();
    loggerMock = { error: vi.fn(), log: vi.fn() };

    const configMock = {
      get: vi.fn((key: string) => {
        if (key === 'DARKROOM_COMFYUI_URL') return COMFYUI_URL;
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new ComfyUIService(
      configMock,
      loggerMock as unknown as LoggerService,
      { get: httpGetMock, post: httpPostMock } as unknown as HttpService,
    );
  });

  describe('ping', () => {
    it('should return true when ComfyUI is reachable', async () => {
      httpGetMock.mockReturnValue(of({ data: { system: 'ok' }, status: 200 }));

      const result = await service.ping();
      expect(result).toBe(true);
      expect(httpGetMock).toHaveBeenCalledWith(`${COMFYUI_URL}/system_stats`);
    });

    it('should return false when ComfyUI is unreachable', async () => {
      httpGetMock.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const result = await service.ping();
      expect(result).toBe(false);
    });

    it('should return false on non-200 status', async () => {
      httpGetMock.mockReturnValue(of({ data: {}, status: 503 }));

      const result = await service.ping();
      // ping only checks status === 200
      expect(result).toBe(false);
    });
  });

  describe('generateImage', () => {
    const promptId = 'prompt_abc123';
    const historyEntry = {
      outputs: {
        '10': {
          images: [
            { filename: 'output_001.png', subfolder: '', type: 'output' },
          ],
        },
      },
      status: { completed: true, status_str: 'success' },
    };

    const setupSuccessfulRun = () => {
      // POST /prompt
      httpPostMock.mockReturnValueOnce(
        of({
          data: { node_errors: {}, number: 1, prompt_id: promptId },
          status: 200,
        }),
      );
      // GET /history/:id
      httpGetMock.mockReturnValueOnce(
        of({ data: { [promptId]: historyEntry }, status: 200 }),
      );
      // GET /view (image bytes)
      httpGetMock.mockReturnValueOnce(
        of({ data: Buffer.from('fake-image-bytes'), status: 200 }),
      );
    };

    it('should generate image with FLUX_DEV model', async () => {
      setupSuccessfulRun();

      const result = await service.generateImage(
        MODEL_KEYS.GENFEED_AI_FLUX_DEV,
        {
          height: 512,
          prompt: 'a cat',
          width: 512,
        },
      );

      expect(result.filename).toBe('output_001.png');
      expect(result.imageBuffer).toBeInstanceOf(Buffer);
    });

    it('should queue prompt and poll history', async () => {
      setupSuccessfulRun();

      await service.generateImage(MODEL_KEYS.GENFEED_AI_FLUX_DEV, {
        prompt: 'test',
      });

      expect(httpPostMock).toHaveBeenCalledWith(
        `${COMFYUI_URL}/prompt`,
        expect.objectContaining({ prompt: expect.anything() }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(httpGetMock).toHaveBeenCalledWith(
        `${COMFYUI_URL}/history/${promptId}`,
      );
    });

    it('should throw when prompt queue returns non-200', async () => {
      httpPostMock.mockReturnValueOnce(of({ data: {}, status: 400 }));

      await expect(
        service.generateImage(MODEL_KEYS.GENFEED_AI_FLUX_DEV, {
          prompt: 'fail',
        }),
      ).rejects.toThrow('ComfyUI /prompt failed (400)');
    });

    it('should throw when history returns error status_str', async () => {
      httpPostMock.mockReturnValueOnce(
        of({
          data: { node_errors: {}, number: 1, prompt_id: promptId },
          status: 200,
        }),
      );
      httpGetMock.mockReturnValueOnce(
        of({
          data: {
            [promptId]: {
              outputs: {},
              status: {
                completed: false,
                messages: ['bad node'],
                status_str: 'error',
              },
            },
          },
          status: 200,
        }),
      );

      await expect(
        service.generateImage(MODEL_KEYS.GENFEED_AI_FLUX_DEV, {
          prompt: 'err',
        }),
      ).rejects.toThrow(`ComfyUI prompt ${promptId} failed`);
    });

    it('should throw when output has no images', async () => {
      httpPostMock.mockReturnValueOnce(
        of({
          data: { node_errors: {}, number: 1, prompt_id: promptId },
          status: 200,
        }),
      );
      httpGetMock.mockReturnValueOnce(
        of({
          data: {
            [promptId]: {
              outputs: { '10': { images: [] } },
              status: { completed: true, status_str: 'success' },
            },
          },
          status: 200,
        }),
      );

      await expect(
        service.generateImage(MODEL_KEYS.GENFEED_AI_FLUX_DEV, {
          prompt: 'no-output',
        }),
      ).rejects.toThrow('ComfyUI produced no output');
    });

    it('should throw for unknown model key', async () => {
      await expect(
        service.generateImage('unknown-model-xyz', { prompt: 'test' }),
      ).rejects.toThrow('Unknown self-hosted model: unknown-model-xyz');
    });

    it('should route GENFEED_AI_FLUX2_DEV correctly', async () => {
      setupSuccessfulRun();

      const result = await service.generateImage(
        MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
        {
          guidance: 3.5,
          prompt: 'a portrait',
        },
      );
      expect(result.filename).toBe('output_001.png');
    });

    it('should route GENFEED_AI_Z_IMAGE_TURBO_LORA correctly', async () => {
      setupSuccessfulRun();

      const result = await service.generateImage(
        MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
        {
          loraPath: 'my_lora.safetensors',
          prompt: 'lora test',
        },
      );
      expect(result.filename).toBe('output_001.png');
    });

    it('should log error and rethrow on failure', async () => {
      httpPostMock.mockReturnValue(throwError(() => new Error('network fail')));

      await expect(
        service.generateImage(MODEL_KEYS.GENFEED_AI_FLUX_DEV, {
          prompt: 'boom',
        }),
      ).rejects.toThrow('network fail');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
