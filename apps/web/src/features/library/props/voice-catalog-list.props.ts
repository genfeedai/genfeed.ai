import type { Voice } from '@models/ingredients/voice.model';
import type { ReactNode } from 'react';

export interface VoiceCatalogListProps {
  children: ReactNode;
  generateHref?: string;
  hasActiveFilters: boolean;
  onCloneVoice: () => void;
  onClearFilters: () => void;
  voices: Voice[];
}
