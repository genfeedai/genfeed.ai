import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  StudioLookAssetType,
  StudioLookPayload,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { StudioLook } from '@genfeedai/models/content/studio-look.model';
import { StudioLookSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface CreateStudioLookBody extends StudioLookPayload {
  assetType: StudioLookAssetType;
  label: string;
}

export type UpdateStudioLookBody = Partial<CreateStudioLookBody>;

export class StudioLooksService extends BaseService<
  StudioLook,
  CreateStudioLookBody,
  UpdateStudioLookBody
> {
  constructor(token: string) {
    super(API_ENDPOINTS.STUDIO_LOOKS, token, StudioLook, StudioLookSerializer);
  }

  public static getInstance(token: string): StudioLooksService {
    return BaseService.getDataServiceInstance(
      StudioLooksService,
      token,
    ) as StudioLooksService;
  }

  public findForAssetType(
    assetType: StudioLookAssetType,
    signal?: AbortSignal,
  ): Promise<StudioLook[]> {
    return this.findAll({ assetType, limit: 100, sort: '-createdAt' }, signal);
  }

  /** Soft-delete a Look. The endpoint intentionally returns only an ack. */
  public removeLook(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      `DELETE ${API_ENDPOINTS.STUDIO_LOOKS}/${id}`,
      this.instance.delete<JsonApiResponseDocument>(`/${id}`).then(() => {}),
    );
  }
}
