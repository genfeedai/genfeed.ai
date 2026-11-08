import type {
  IAvatarTwin,
  IAvatarTwinConsentLink,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface StartAvatarTwinInput {
  idempotencyKey: string;
  /** Keep the recording in the Library after HeyGen has it. */
  isRecordingKept?: boolean;
  name: string;
  sourceIngredientId: string;
}

/** Digital twins the signed-in person records of themselves. */
export class AvatarTwinsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/avatar-twins`, token);
  }

  static getInstance(token: string): AvatarTwinsService {
    return HTTPBaseService.getBaseServiceInstance(AvatarTwinsService, token);
  }

  async list(signal?: AbortSignal): Promise<IAvatarTwin[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      signal,
    });
    return deserializeCollection<IAvatarTwin>(response.data);
  }

  async start(input: StartAvatarTwinInput): Promise<IAvatarTwin> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return deserializeResource<IAvatarTwin>(response.data);
  }

  /** Reads the twin and refreshes its training and consent status. */
  async get(id: string, signal?: AbortSignal): Promise<IAvatarTwin> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${encodeURIComponent(id)}`,
      { signal },
    );
    return deserializeResource<IAvatarTwin>(response.data);
  }

  async requestConsentLink(
    id: string,
    returnPath: string,
  ): Promise<IAvatarTwinConsentLink> {
    const response = await this.instance.post<{
      data: IAvatarTwinConsentLink;
    }>(`/${encodeURIComponent(id)}/consent-link`, { returnPath });
    return response.data.data;
  }

  async remove(id: string): Promise<IAvatarTwin> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/${encodeURIComponent(id)}`,
    );
    return deserializeResource<IAvatarTwin>(response.data);
  }
}
