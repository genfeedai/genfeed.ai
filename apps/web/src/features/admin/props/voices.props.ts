import type { VoiceProvider } from '@genfeedai/contracts';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import type {
  TableErrorState,
  TableSortDirection,
} from '@props/ui/display/table.props';

export type VoiceCatalogToggleField =
  | 'isActive'
  | 'isDefaultSelectable'
  | 'isFeatured';

export interface VoicesCatalogTableProps {
  error?: TableErrorState;
  isLoading: boolean;
  togglingKey: string | null;
  voices: ExternalVoice[];
  sortKey?: string;
  sortDirection?: TableSortDirection;
  onSortChange?: (key: string, direction: TableSortDirection) => void;
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
  providerFilter: ProviderFilter;
  onProviderFilterChange: (value: ProviderFilter) => void;
}

export interface VoicesSyncControlsProps {
  isSyncingAll: boolean;
  syncingProvider: VoiceProvider | null;
  onSync: (providers?: VoiceProvider[]) => void;
}
