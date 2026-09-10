import type { RouterPriority } from '../..';
import type {
  StudioGenerateCapabilities,
  StudioGenerateType,
} from './studio-generate.interface';

/**
 * Who last decided a setup field. Unset in {@link GenerationSetupSources} means
 * the agent owns the field and may re-recommend it on every prompt change.
 */
export type GenerationSetupSource = 'agent' | 'preset' | 'user';

/**
 * The complete generation configuration one submit runs with, shared by the
 * agent composer and Studio. Field vocabulary matches
 * {@link StudioGenerateSettings} so payload builders stay untouched.
 */
export interface GenerationSetupValues {
  aspectRatio: string;
  brandingMode: 'brand' | 'off';
  camera?: string;
  cameraMovement?: string;
  duration?: number;
  isPromptEnhanceEnabled: boolean;
  lens?: string;
  lighting?: string;
  /** Empty string = Auto; the server RouterService resolves the model. */
  modelKey: string;
  mood?: string;
  outputs: number;
  prioritize: RouterPriority;
  promptTemplate?: string;
  resolution?: string;
  scene?: string;
  style?: string;
  type: StudioGenerateType;
}

export type GenerationSetupFieldKey = keyof GenerationSetupValues;

export type GenerationSetupSources = Partial<
  Record<GenerationSetupFieldKey, GenerationSetupSource>
>;

export interface GenerationSetup {
  /** Pinned preset. While set, agent recommendations never rewrite fields. */
  presetId?: string;
  sources: GenerationSetupSources;
  values: GenerationSetupValues;
}

/**
 * One agent recommendation pass. Every recommended key carries a
 * human-readable reason surfaced next to the field's provenance dot.
 */
export interface GenerationSetupRecommendation {
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  values: Partial<GenerationSetupValues>;
}

export interface GenerationSetupRecommendationInput {
  capabilities: StudioGenerateCapabilities;
  hasZeroCredits?: boolean;
  /** Surfaces that let the agent pick image vs video leave this unset. */
  lockedType?: StudioGenerateType;
  prompt: string;
  type: StudioGenerateType;
}
