import { ButtonSize, ButtonVariant, VoiceProvider } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import type {
  ProviderFilter,
  VoicesCatalogSearchProps,
  VoicesSyncControlsProps,
} from '@/features/admin/props/voices.props';

/** The voice search, with the provider filter attached inside it. */
export function VoicesCatalogSearch({
  search,
  onSearchChange,
  providerFilter,
  onProviderFilterChange,
}: VoicesCatalogSearchProps) {
  const translate = useTranslations('pages.adminVoices');
  const providerFilters: Array<{ label: string; value: ProviderFilter }> = [
    { label: translate('providerAll'), value: 'all' },
    { label: translate('providerElevenLabs'), value: VoiceProvider.ELEVENLABS },
    { label: translate('providerHeyGen'), value: VoiceProvider.HEYGEN },
  ];

  return (
    <SearchField
      ariaLabel={translate('searchPlaceholder')}
      onSearch={onSearchChange}
      placeholder={translate('searchPlaceholder')}
      value={search}
    >
      <FilterMenu
        facets={[
          {
            defaultValue: 'all',
            key: 'provider',
            label: translate('providerLabel'),
            onChange: (value) =>
              onProviderFilterChange(value as ProviderFilter),
            options: providerFilters,
            selection: 'single',
            value: providerFilter,
          },
        ]}
        isAttached
        onClear={() => onProviderFilterChange('all')}
      />
    </SearchField>
  );
}

/** The per-provider sync dropdown; "Sync All" is the page's primary action. */
export function VoicesSyncMenu({
  isSyncingAll,
  syncingProvider,
  onSync,
}: VoicesSyncControlsProps) {
  const translate = useTranslations('pages.adminVoices');
  const syncProviders: Array<{ label: string; provider: VoiceProvider }> = [
    { label: translate('syncElevenLabs'), provider: VoiceProvider.ELEVENLABS },
    { label: translate('syncHeyGen'), provider: VoiceProvider.HEYGEN },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          isDisabled={isSyncingAll || syncingProvider !== null}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('syncProvider')}
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {syncProviders.map(({ label, provider }) => (
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
  const translate = useTranslations('pages.adminVoices');

  return (
    <Button
      isDisabled={isSyncingAll || syncingProvider !== null}
      onClick={() => onSync()}
      size={ButtonSize.SM}
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    >
      <RefreshCw className="mr-2 size-4" />
      {translate('syncAll')}
    </Button>
  );
}
