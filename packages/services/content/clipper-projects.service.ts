import type { IPublicYoutubeClipperToolClaim } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class ClipperProjectsService extends HTTPBaseService {
  private static readonly instances = new Map<string, ClipperProjectsService>();

  private constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/clipper-projects`, token);
  }

  public static getInstance(token: string): ClipperProjectsService {
    const existing = ClipperProjectsService.instances.get(token);
    if (existing) {
      return existing;
    }
    const instance = new ClipperProjectsService(token);
    ClipperProjectsService.instances.set(token, instance);
    return instance;
  }

  public async claimPublicYoutubeClipper(data: {
    readonly brandId?: string;
    readonly previewToken: string;
  }): Promise<IPublicYoutubeClipperToolClaim> {
    return await this.instance
      .post<JsonApiResponseDocument>('public-tool/claim', data)
      .then((res) => {
        const project = deserializeResource<{ id: string }>(res.data);
        return { projectId: project.id, status: 'claimed' };
      });
  }
}
