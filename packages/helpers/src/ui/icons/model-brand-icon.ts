import type { IconType } from '@genfeedai/interfaces';
import { BytedanceIcon, FluxIcon, MetaIcon, SiGoogleIcon } from './brands';

const MODEL_BRAND_ICONS: Record<string, IconType> = {
  bytedance: BytedanceIcon,
  flux: FluxIcon,
  google: SiGoogleIcon,
  meta: MetaIcon,
};

export function getModelBrandIcon(
  iconKey: string | undefined,
): IconType | undefined {
  if (!iconKey) {
    return undefined;
  }
  return MODEL_BRAND_ICONS[iconKey];
}
