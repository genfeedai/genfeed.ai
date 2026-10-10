import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Preset } from '@genfeedai/models/elements/preset.model';
import { PresetSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class PresetsService extends BaseService<Preset> {
  constructor(token: string) {
    super(API_ENDPOINTS.PRESETS, token, Preset, PresetSerializer);
  }

  public static getInstance(token: string): PresetsService {
    return BaseService.getDataServiceInstance(PresetsService, token);
  }

  /**
   * Unlike the base patch, `null` is sent: it clears a stored preset setting
   * (an emptied Duration). `undefined` still leaves a field unchanged.
   */
  public override patch(id: string, body: Partial<Preset>): Promise<Preset> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}`, body)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }
}
