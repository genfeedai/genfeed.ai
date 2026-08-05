import type { IconType } from '@genfeedai/interfaces';
import {
  AnthropicIcon,
  BytedanceIcon,
  DeepseekIcon,
  FluxIcon,
  MetaIcon,
  OpenAiIcon,
  SiGoogleIcon,
  XTwitterIcon,
} from './brands';

const MODEL_BRAND_ICONS: Record<string, IconType> = {
  anthropic: AnthropicIcon,
  bytedance: BytedanceIcon,
  deepseek: DeepseekIcon,
  flux: FluxIcon,
  google: SiGoogleIcon,
  meta: MetaIcon,
  openai: OpenAiIcon,
  xai: XTwitterIcon,
};

export function getModelBrandIcon(
  iconKey: string | undefined,
): IconType | undefined {
  if (!iconKey) {
    return undefined;
  }
  return MODEL_BRAND_ICONS[iconKey];
}
