import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { StudioGenerateDraftPayload } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { StudioGenerateDraft } from '@genfeedai/models/content/studio-generate-draft.model';
import { StudioGenerateDraftSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

/**
 * The Generate composer draft for the authenticated user and active brand.
 * There is exactly one per scope, so the API addresses it as `current`.
 */
export class StudioGenerateDraftsService extends BaseService<
  StudioGenerateDraft,
  StudioGenerateDraftPayload,
  StudioGenerateDraftPayload
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.STUDIO_GENERATE_DRAFTS,
      token,
      StudioGenerateDraft,
      StudioGenerateDraftSerializer,
    );
  }

  public static getInstance(token: string): StudioGenerateDraftsService {
    return BaseService.getDataServiceInstance(
      StudioGenerateDraftsService,
      token,
    ) as StudioGenerateDraftsService;
  }

  /** Resolves `null` when this user has never drafted under the brand. */
  public getCurrent(signal?: AbortSignal): Promise<StudioGenerateDraft | null> {
    return this.executeWithErrorHandling(
      `GET ${API_ENDPOINTS.STUDIO_GENERATE_DRAFTS}/current`,
      this.instance
        .get<JsonApiResponseDocument>('/current', { signal })
        .then((res) => (res.data?.data ? this.mapOne(res.data) : null)),
    );
  }

  public saveCurrent(
    body: StudioGenerateDraftPayload,
    signal?: AbortSignal,
  ): Promise<StudioGenerateDraft> {
    return this.executeWithErrorHandling(
      `PUT ${API_ENDPOINTS.STUDIO_GENERATE_DRAFTS}/current`,
      this.instance
        .put<JsonApiResponseDocument>('/current', body, { signal })
        .then((res) => this.mapOne(res.data)),
    );
  }
}
