import type { CinematicShort } from '../api-types/contracts/cinematic-short.contract';
import { CINEMATIC_SHORT_DATA } from './preset-catalog.generated';

/** Defined in genfeedai/presets and pinned into `presets/`; see `scripts/sync-product-presets.ts`. */
export const CINEMATIC_SHORTS =
  CINEMATIC_SHORT_DATA as unknown as CinematicShort[];

export function cinematicShortId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}
