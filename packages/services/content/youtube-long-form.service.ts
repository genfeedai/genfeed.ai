import type {
  IAuthenticatedYoutubeLongFormToolResult,
  IYoutubeLongFormSourceLibraryResult,
  PublicYoutubeLongFormOutputType,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class YoutubeLongFormService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): YoutubeLongFormService {
    return HTTPBaseService.getBaseServiceInstance(
      YoutubeLongFormService,
      token,
    ) as YoutubeLongFormService;
  }

  async create(
    youtubeUrl: string,
    outputType: PublicYoutubeLongFormOutputType,
  ): Promise<IAuthenticatedYoutubeLongFormToolResult> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/youtube-long-form',
      { outputType, youtubeUrl },
    );
    return deserializeResource<IAuthenticatedYoutubeLongFormToolResult>(
      response.data,
    );
  }

  async promoteSourceToLibrary(
    sourceArtifactId: string,
  ): Promise<IYoutubeLongFormSourceLibraryResult> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/youtube-long-form/${encodeURIComponent(sourceArtifactId)}/source-library`,
    );
    const ingredient = deserializeResource<{ id: string }>(response.data);
    return { ingredientId: ingredient.id };
  }
}
