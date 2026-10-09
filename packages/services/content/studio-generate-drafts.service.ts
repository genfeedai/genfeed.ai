import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { StudioGenerateDraftPayload } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { StudioGenerateDraft } from '@genfeedai/models/content/studio-generate-draft.model';
import { StudioGenerateDraftSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

/**
 * The Generate composer draft for the authenticated user and a brand. There
 * is exactly one per scope, so the API addresses it as `current`. The brand
 * is always the one open in this tab, never the member's last-selected one.
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
  public getCurrent(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<StudioGenerateDraft | null> {
    return this.executeWithErrorHandling(
      `GET ${API_ENDPOINTS.STUDIO_GENERATE_DRAFTS}/current`,
      this.instance
        .get<JsonApiResponseDocument>('/current', {
          params: { brand: brandId },
          signal,
        })
        .then((res) => (res.data?.data ? this.mapOne(res.data) : null)),
    );
  }

  /**
   * `isKeepalive` sends the write through `fetch` with `keepalive`, so a save
   * started while the page unloads still reaches the API.
   */
  public saveCurrent(
    brandId: string,
    body: StudioGenerateDraftPayload,
    options: { isKeepalive?: boolean; signal?: AbortSignal } = {},
  ): Promise<StudioGenerateDraft> {
    return this.executeWithErrorHandling(
      `PUT ${API_ENDPOINTS.STUDIO_GENERATE_DRAFTS}/current`,
      this.instance
        .put<JsonApiResponseDocument>(
          '/current',
          { ...body, brandId },
          options.isKeepalive
            ? { adapter: 'fetch', fetchOptions: { keepalive: true } }
            : { signal: options.signal },
        )
        .then((res) => this.mapOne(res.data)),
    );
  }
}
