import { API_ENDPOINTS } from '@genfeedai/constants';
import { Preset } from '@genfeedai/models/elements/preset.model';
import { PresetSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class PresetsService extends BaseService<Preset> {
  constructor(token: string) {
    super(API_ENDPOINTS.PRESETS, token, Preset, PresetSerializer);
  }

  public static getInstance(token: string): PresetsService {
    return BaseService.getDataServiceInstance(
      PresetsService,
      token,
    ) as PresetsService;
  }
}
