import type { IconType } from '@genfeedai/contracts/interfaces';
import { DevIcon, FluxIcon, GenfeedIcon } from './brands';
import {
  AnthropicProviderIcon as AnthropicIcon,
  ArgilIcon,
  BflIcon,
  BytedanceProviderIcon as BytedanceIcon,
  DeepseekProviderIcon as DeepseekIcon,
  FalIcon,
  GoogleProviderIcon as GoogleIcon,
  HeygenIcon,
  HiggsfieldIcon,
  IdeogramIcon,
  KlingIcon,
  LeonardoIcon,
  LumaIcon,
  MetaProviderIcon as MetaIcon,
  MinimaxIcon,
  MoonshotIcon,
  MurekaIcon,
  OpenAiProviderIcon as OpenAiIcon,
  PixverseIcon,
  PrunaIcon,
  QwenIcon,
  RecraftIcon,
  ReplicateIcon,
  RunwayIcon,
  StabilityIcon,
  TopazIcon,
  ViduIcon,
  WanIcon,
  XaiIcon,
} from './brands/model-provider-icons';

const MODEL_BRAND_ICONS: Record<string, IconType> = {
  anthropic: AnthropicIcon,
  argil: ArgilIcon,
  bytedance: BytedanceIcon,
  deepseek: DeepseekIcon,
  fal: FalIcon,
  bfl: BflIcon,
  flux: FluxIcon,
  genfeed: GenfeedIcon,
  google: GoogleIcon,
  heygen: HeygenIcon,
  higgsfield: HiggsfieldIcon,
  ideogram: IdeogramIcon,
  kling: KlingIcon,
  leonardo: LeonardoIcon,
  mureka: MurekaIcon,
  pixverse: PixverseIcon,
  recraft: RecraftIcon,
  stability: StabilityIcon,
  vidu: ViduIcon,
  local: DevIcon,
  luma: LumaIcon,
  meta: MetaIcon,
  minimax: MinimaxIcon,
  moonshot: MoonshotIcon,
  openai: OpenAiIcon,
  pruna: PrunaIcon,
  qwen: QwenIcon,
  replicate: ReplicateIcon,
  runway: RunwayIcon,
  topaz: TopazIcon,
  wan: WanIcon,
  xai: XaiIcon,
};

export function getModelBrandIcon(
  iconKey: string | undefined,
): IconType | undefined {
  if (!iconKey) {
    return undefined;
  }
  return MODEL_BRAND_ICONS[iconKey];
}
