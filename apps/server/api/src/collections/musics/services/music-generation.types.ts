import type { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { ModelCategory, ModelProvider } from '@genfeedai/contracts';

/**
 * Provider identifiers a music generation adapter can claim. Kept as a plain
 * union (not `ModelProvider`) so a future direct integration that has no
 * shared-provider enum member (e.g. Mureka) can still register cleanly.
 */
export type MusicGenerationProvider = 'replicate' | 'fal' | 'mureka';

export interface MusicGenerationProviderRequest {
  /** Full DTO so adapters can read provider-specific optional params. */
  createMusicDto: CreateMusicDto;
  duration: number;
  model: string;
  modelCategory: ModelCategory;
  /** The registry row's execution identifier — never a hardcoded constant. */
  modelEndpoint: string;
  modelProvider: ModelProvider | string;
  outputs: number;
  prompt: string;
  seed: number;
}

export interface MusicGenerationProviderResult {
  externalId: string;
  /**
   * Present only for providers that complete synchronously (fal, Mureka —
   * both poll to completion inside their own adapter). Replicate stays
   * async: no `outputUrl`, and the Replicate webhook finalizes the
   * ingredient later. When set, the caller finalizes the ingredient
   * immediately instead of waiting for a webhook that will never arrive.
   */
  outputUrl?: string;
}

export interface MusicGenerationProviderAdapter {
  readonly provider: MusicGenerationProvider;
  generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult>;
  supports(model: string, provider?: ModelProvider | string): boolean;
}
