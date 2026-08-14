import type { IconType } from '@genfeedai/interfaces';
import {
  AnthropicIcon,
  ArgilIcon,
  BytedanceIcon,
  DeepseekIcon,
  DevIcon,
  FalIcon,
  FluxIcon,
  GenfeedIcon,
  HeygenIcon,
  IdeogramIcon,
  KlingIcon,
  LumaIcon,
  MetaIcon,
  MoonshotIcon,
  OpenAiIcon,
  PrunaIcon,
  QwenIcon,
  ReplicateIcon,
  RunwayIcon,
  SiGoogleIcon,
  TopazIcon,
  WanIcon,
  XTwitterIcon,
} from './brands';

const MODEL_BRAND_ICONS: Record<string, IconType> = {
  anthropic: AnthropicIcon,
  argil: ArgilIcon,
  bytedance: BytedanceIcon,
  deepseek: DeepseekIcon,
  fal: FalIcon,
  flux: FluxIcon,
  genfeed: GenfeedIcon,
  google: SiGoogleIcon,
  heygen: HeygenIcon,
  ideogram: IdeogramIcon,
  kling: KlingIcon,
  local: DevIcon,
  luma: LumaIcon,
  meta: MetaIcon,
  moonshot: MoonshotIcon,
  openai: OpenAiIcon,
  pruna: PrunaIcon,
  qwen: QwenIcon,
  replicate: ReplicateIcon,
  runway: RunwayIcon,
  topaz: TopazIcon,
  wan: WanIcon,
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
