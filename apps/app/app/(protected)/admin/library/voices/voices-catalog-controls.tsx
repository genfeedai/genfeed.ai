import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  VoiceProvider,
} from '@genfeedai/contracts';
import type {
  VoicesCatalogControlsProps as Props,
  ProviderFilter,
} from '@props/admin/voices.props';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { RefreshCw } from 'lucide-react';

const PROVIDER_FILTERS: Array<{ label: string; value: ProviderFilter }> = [
  { label: 'All providers', value: 'all' },
  { label: 'ElevenLabs', value: VoiceProvider.ELEVENLABS },
  { label: 'HeyGen', value: VoiceProvider.HEYGEN },
];

export default function VoicesCatalogControls({
  view,
  onViewChange,
  isSyncingAll,
  providerFilter,
  search,
  syncingProvider,
  onProviderFilterChange,
  onSearchChange,
  onSync,
}: Props) {
  return (
    <CollectionToolbar
      view={view}
      onViewChange={onViewChange}
      search={
        <FormSearchbar
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or external ID"
          size={ComponentSize.MD}
          value={search}
        />
      }
      filters={
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
          <div className="flex flex-wrap gap-2">
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
            <Button
              isDisabled={isSyncingAll || syncingProvider !== null}
              onClick={() => onSync([VoiceProvider.ELEVENLABS])}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Sync ElevenLabs
            </Button>
            <Button
              isDisabled={isSyncingAll || syncingProvider !== null}
              onClick={() => onSync([VoiceProvider.HEYGEN])}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Sync HeyGen
            </Button>
          </div>
        </>
      }
    />
  );
}
