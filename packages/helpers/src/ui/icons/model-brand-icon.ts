import type { IconType } from '@genfeedai/contracts/interfaces';
import { DevIcon, FluxIcon, GenfeedIcon } from './brands';
import {
  ArgilIcon,
  CrunIcon,
  HeygenIcon,
  LeonardoIcon,
  WanIcon,
} from './brands/lazy-raster-brand-icons';
import {
  AnthropicProviderIcon as AnthropicIcon,
  BflIcon,
  BytedanceProviderIcon as BytedanceIcon,
  DeepseekProviderIcon as DeepseekIcon,
  ElevenLabsIcon,
  FalIcon,
  GoogleProviderIcon as GoogleIcon,
  HiggsfieldIcon,
  IdeogramIcon,
  KlingIcon,
  LumaIcon,
  MetaProviderIcon as MetaIcon,
  MinimaxIcon,
  MoonshotIcon,
  MurekaIcon,
  OpenAiProviderIcon as OpenAiIcon,
  OpenRouterIcon,
  PixverseIcon,
  PrunaIcon,
  QwenIcon,
  RecraftIcon,
  ReplicateIcon,
  RunwayIcon,
  StabilityIcon,
  TopazIcon,
  ViduIcon,
  XaiIcon,
} from './brands/model-provider-icons';

const MODEL_BRAND_ICONS: Record<string, IconType> = {
  anthropic: AnthropicIcon,
  argil: ArgilIcon,
  bytedance: BytedanceIcon,
  crun: CrunIcon,
  deepseek: DeepseekIcon,
  elevenlabs: ElevenLabsIcon,
  fal: FalIcon,
  bfl: BflIcon,
  flux: FluxIcon,
  genfeed: GenfeedIcon,
  'genfeed-ai': GenfeedIcon,
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
  openrouter: OpenRouterIcon,
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
