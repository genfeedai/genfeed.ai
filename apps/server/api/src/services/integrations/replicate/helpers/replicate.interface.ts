import { BrandEntity } from '@api/collections/brands/entities/brand.entity';

export interface ReplicateInputParams {
  prompt: string;
  brand?: BrandEntity;
  seed?: number;
  mood?: string;
  camera?: string;
  style?: string;
  scene?: string;
  tags?: string[];
  blacklist?: string[];
  sounds?: string[];
  width?: number;
  height?: number;
  duration?: number;
  outputs?: number;
  references?: string[];
  endFrame?: string; // For video interpolation (Veo 3.1)
  image?: string; // Added for compatibility with image references
  resolution?: string;
  video?: string;
  target_fps?: number;
  target_resolution?: string;
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
  isAudioEnabled?: boolean; // For video audio generation (Veo 3.1)
  speech?: string;
}
