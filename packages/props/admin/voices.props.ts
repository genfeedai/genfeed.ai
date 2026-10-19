import type { VoiceProvider } from '@genfeedai/contracts';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import type { TableErrorState } from '@props/ui/display/table.props';

export type VoiceCatalogToggleField =
  | 'isActive'
  | 'isDefaultSelectable'
  | 'isFeatured';

export interface VoicesCatalogTableProps {
  error?: TableErrorState;
  isLoading: boolean;
  togglingKey: string | null;
  voices: ExternalVoice[];
  onToggle: (
    voice: ExternalVoice,
    field: VoiceCatalogToggleField,
    value: boolean,
  ) => void;
}

export type ProviderFilter =
  | 'all'
  | VoiceProvider.ELEVENLABS
  | VoiceProvider.HEYGEN;

export interface VoicesCatalogSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export interface VoicesCatalogFiltersProps {
  providerFilter: ProviderFilter;
  onProviderFilterChange: (value: ProviderFilter) => void;
}

export interface VoicesSyncControlsProps {
  isSyncingAll: boolean;
  syncingProvider: VoiceProvider | null;
  onSync: (providers?: VoiceProvider[]) => void;
}

export interface VoicesLibraryState {
  voices: ExternalVoice[];
  isLoading: boolean;
  isSyncingAll: boolean;
  syncingProvider: VoiceProvider | null;
  togglingKey: string | null;
}

export type VoicesLibraryAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; voices: ExternalVoice[] }
  | { type: 'LOAD_ERROR' }
  | { type: 'SYNC_START'; provider: VoiceProvider | null }
  | { type: 'SYNC_END' }
  | { type: 'TOGGLE_START'; key: string }
  | { type: 'TOGGLE_SUCCESS'; voice: ExternalVoice }
  | { type: 'TOGGLE_END' };
