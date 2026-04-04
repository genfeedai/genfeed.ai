import type { ModelCategory, ModelKey } from '@genfeedai/enums';

export interface MediaConfig {
  placeholder: string;
  assetType: string;
  defaultModel: ModelKey;
  presetType?: ModelCategory;
  generateLabel?: string;
  buttons?: {
    presets?: boolean;
    model?: boolean;
    format?: boolean;
    style?: boolean;
    camera?: boolean;
    mood?: boolean;
    scene?: boolean;
    reference?: boolean;
    fontFamily?: boolean;
    tags?: boolean;
    upload?: boolean;
    gallery?: boolean;
    sounds?: boolean;
    blacklist?: boolean;
    avatar?: boolean;
    voice?: boolean;
  };
}
