import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  VoiceProvider,
} from '@genfeedai/contracts';
import type {
  ProviderFilter,
  VoicesCatalogFiltersProps,
  VoicesCatalogSearchProps,
  VoicesSyncControlsProps,
} from '@props/admin/voices.props';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ChevronDown, RefreshCw } from 'lucide-react';

const PROVIDER_FILTERS: Array<{ label: string; value: ProviderFilter }> = [
  { label: 'All providers', value: 'all' },
  { label: 'ElevenLabs', value: VoiceProvider.ELEVENLABS },
  { label: 'HeyGen', value: VoiceProvider.HEYGEN },
];

const SYNC_PROVIDERS: Array<{ label: string; provider: VoiceProvider }> = [
  { label: 'Sync ElevenLabs', provider: VoiceProvider.ELEVENLABS },
  { label: 'Sync HeyGen', provider: VoiceProvider.HEYGEN },
];

export function VoicesCatalogSearch({
  search,
  onSearchChange,
}: VoicesCatalogSearchProps) {
  return (
    <FormSearchbar
      onChange={(event) => onSearchChange(event.target.value)}
      placeholder="Search by name or external ID"
      size={ComponentSize.MD}
      value={search}
    />
  );
}

export function VoicesCatalogFilters({
  providerFilter,
  view,
  onProviderFilterChange,
  onViewChange,
}: VoicesCatalogFiltersProps) {
  return (
    <>
      <Select
        onValueChange={(value) =>
          onProviderFilterChange(value as ProviderFilter)
        }
        value={providerFilter}
      >
        <SelectTrigger aria-label="Provider" className="w-auto min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_FILTERS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CollectionToolbar view={view} onViewChange={onViewChange} />
    </>
  );
}

/** The per-provider sync dropdown; "Sync All" is the page's primary action. */
export function VoicesSyncMenu({
  isSyncingAll,
  syncingProvider,
  onSync,
}: VoicesSyncControlsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          isDisabled={isSyncingAll || syncingProvider !== null}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          Sync provider
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SYNC_PROVIDERS.map(({ label, provider }) => (
          <DropdownMenuItem key={provider} onSelect={() => onSync([provider])}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VoicesSyncAllButton({
  isSyncingAll,
  syncingProvider,
  onSync,
}: VoicesSyncControlsProps) {
  return (
    <Button
      isDisabled={isSyncingAll || syncingProvider !== null}
      onClick={() => onSync()}
      size={ButtonSize.SM}
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    >
      <RefreshCw className="mr-2 size-4" />
      Sync All
    </Button>
  );
}
