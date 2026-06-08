'use client';

import { ButtonSize, ButtonVariant, VoiceProvider } from '@genfeedai/enums';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { HiArrowPath, HiMagnifyingGlass } from 'react-icons/hi2';

export type ProviderFilter =
  | 'all'
  | VoiceProvider.ELEVENLABS
  | VoiceProvider.HEYGEN;

const PROVIDER_FILTERS: Array<{ label: string; value: ProviderFilter }> = [
  { label: 'All providers', value: 'all' },
  { label: 'ElevenLabs', value: VoiceProvider.ELEVENLABS },
  { label: 'HeyGen', value: VoiceProvider.HEYGEN },
];

type Props = {
  isSyncingAll: boolean;
  providerFilter: ProviderFilter;
  search: string;
  syncingProvider: VoiceProvider | null;
  onProviderFilterChange: (value: ProviderFilter) => void;
  onSearchChange: (value: string) => void;
  onSync: (providers?: VoiceProvider[]) => void;
};

export default function VoicesCatalogControls({
  isSyncingAll,
  providerFilter,
  search,
  syncingProvider,
  onProviderFilterChange,
  onSearchChange,
  onSync,
}: Props) {
  return (
    <WorkspaceSurface
      title="Catalog Controls"
      tone="muted"
      data-testid="voices-library-controls-surface"
    >
      <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground/70">
              Search
            </span>
            <div className="relative">
              <HiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
              <Input
                className="pl-9"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by name or external ID"
                value={search}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground/70">
              Provider
            </span>
            <Select
              onValueChange={(value) =>
                onProviderFilterChange(value as ProviderFilter)
              }
              value={providerFilter}
            >
              <SelectTrigger>
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
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            isDisabled={isSyncingAll || syncingProvider !== null}
            onClick={() => onSync()}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <HiArrowPath className="mr-2 size-4" />
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
            variant={ButtonVariant.OUTLINE}
            withWrapper={false}
          >
            Sync HeyGen
          </Button>
        </div>
      </div>
    </WorkspaceSurface>
  );
}
