import type { VoiceProvider } from '@genfeedai/contracts';
import type { ExternalVoice } from '@models/elements/external-voice.model';

export interface VoiceCatalogCardProps {
  togglingKey: string | null;
  voice: ExternalVoice;
  onToggle: (
    voice: ExternalVoice,
    field: 'isActive' | 'isDefaultSelectable' | 'isFeatured',
    value: boolean,
  ) => void;
}

export type ProviderFilter =
  | 'all'
  | VoiceProvider.ELEVENLABS
  | VoiceProvider.HEYGEN;

export interface VoicesCatalogControlsProps {
  isSyncingAll: boolean;
  providerFilter: ProviderFilter;
  search: string;
  syncingProvider: VoiceProvider | null;
  onProviderFilterChange: (value: ProviderFilter) => void;
  onSearchChange: (value: string) => void;
  onSync: (providers?: VoiceProvider[]) => void;
}

export interface VoicesLibraryState {
  voices: ExternalVoice[];
  isLoading: boolean;
  isSyncingAll: boolean;
  syncingProvider: VoiceProvider | null;
  search: string;
  providerFilter: ProviderFilter;
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
  | { type: 'TOGGLE_END' }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_PROVIDER_FILTER'; providerFilter: ProviderFilter };
