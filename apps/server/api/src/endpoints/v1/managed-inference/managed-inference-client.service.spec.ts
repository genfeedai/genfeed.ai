vi.mock('@api/config/config.service', () => ({
  ConfigService: class ConfigService {},
}));

import { ConfigService } from '@api/config/config.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';

describe('ManagedInferenceClientService', () => {
  const configService = {
    get: vi.fn(),
  } as unknown as ConfigService;

  const httpService = {
    post: vi.fn(),
  } as unknown as HttpService;

  let service: ManagedInferenceClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ManagedInferenceClientService(configService, httpService);
  });

  it('posts genfeedai video requests to the managed inference endpoint', async () => {
    vi.mocked(httpService.post).mockReturnValue(
      of({
        data: {
          creditsDebited: 1,
          model: 'genfeedai/wan-i2v-lora',
          operation: ManagedInferenceOperation.VIDEO,
          output: {
            jobId: 'job-1',
            url: 'https://video.test/out.mp4',
          },
          provider: ManagedInferenceProvider.GENFEEDAI,
        },
      }),
    );

    const result = await service.generateVideo({
      apiKey: 'gf_live_managed',
      endpointUrl: 'https://api.genfeed.ai/v1/managed-inference',
      input: {
        imageUrl: 'https://img.test/source.jpg',
        prompt: 'cinematic pan',
      },
      model: 'genfeedai/wan-i2v-lora',
      provider: ManagedInferenceProvider.GENFEEDAI,
    });

    expect(result).toBe('https://video.test/out.mp4');
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/managed-inference',
      {
        credits: 1,
        input: {
          imageUrl: 'https://img.test/source.jpg',
          prompt: 'cinematic pan',
        },
        model: 'genfeedai/wan-i2v-lora',
        operation: ManagedInferenceOperation.VIDEO,
        provider: ManagedInferenceProvider.GENFEEDAI,
      },
      {
        headers: {
          Authorization: 'Bearer gf_live_managed',
        },
      },
    );
  });

  it('throws when video output has no URL or job id', async () => {
    vi.mocked(httpService.post).mockReturnValue(
      of({
        data: {
          creditsDebited: 1,
          model: 'genfeedai/wan-i2v-lora',
          output: {},
          provider: ManagedInferenceProvider.GENFEEDAI,
        },
      }),
    );

    await expect(
      service.generateVideo({
        apiKey: 'gf_live_managed',
        endpointUrl: 'https://api.genfeed.ai/v1/managed-inference',
        input: { imageUrl: 'https://img.test/source.jpg', prompt: 'x' },
        model: 'genfeedai/wan-i2v-lora',
        provider: ManagedInferenceProvider.GENFEEDAI,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
