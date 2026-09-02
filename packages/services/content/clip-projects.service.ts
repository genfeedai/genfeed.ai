import type { IPublicYoutubeClipToolClaim } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class ClipProjectsService extends HTTPBaseService {
  private static readonly instances = new Map<string, ClipProjectsService>();

  private constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/clip-projects`, token);
  }

  public static getInstance(token: string): ClipProjectsService {
    const existing = ClipProjectsService.instances.get(token);
    if (existing) {
      return existing;
    }
    const instance = new ClipProjectsService(token);
    ClipProjectsService.instances.set(token, instance);
    return instance;
  }

  public async claimPublicYoutubeClip(data: {
    readonly brandId?: string;
    readonly previewToken: string;
  }): Promise<IPublicYoutubeClipToolClaim> {
    return await this.instance
      .post<JsonApiResponseDocument>('public-tool/claim', data)
      .then((res) => {
        const project = deserializeResource<{ id: string }>(res.data);
        return { projectId: project.id, status: 'claimed' };
      });
  }
}
