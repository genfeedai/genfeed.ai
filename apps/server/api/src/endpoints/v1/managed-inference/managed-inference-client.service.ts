import { ConfigService } from '@api/config/config.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type { ManagedInferenceResponse } from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ManagedInferenceClientService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async generateImage(params: {
    apiKey: string;
    endpointUrl?: string;
    input: Record<string, unknown>;
    model: string;
    provider: ManagedInferenceProvider;
  }): Promise<string> {
    const endpointUrl = params.endpointUrl ?? this.buildDefaultEndpointUrl();

    if (!endpointUrl) {
      throw new BadRequestException(
        'Managed inference endpoint is not configured',
      );
    }

    const response = await firstValueFrom(
      this.httpService.post<ManagedInferenceResponse>(
        endpointUrl,
        {
          credits: 1,
          input: params.input,
          model: params.model,
          operation: ManagedInferenceOperation.IMAGE,
          provider: params.provider,
        },
        {
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
          },
        },
      ),
    );

    return this.extractImageUrl(response.data);
  }

  private buildDefaultEndpointUrl(): string | undefined {
    const explicitUrl = this.configService.get('GENFEED_MANAGED_INFERENCE_URL');
    if (explicitUrl) {
      return explicitUrl;
    }

    const apiUrl = this.configService.get('GENFEEDAI_API_URL');
    if (!apiUrl) {
      return undefined;
    }

    return `${apiUrl.replace(/\/+$/, '')}/v1/managed-inference`;
  }

  private extractImageUrl(response: ManagedInferenceResponse): string {
    if (typeof response.output === 'string') {
      return response.output;
    }

    const url = response.output.url;
    if (typeof url === 'string') {
      return url;
    }

    throw new BadRequestException(
      'Managed inference response did not include an image URL',
    );
  }
}
