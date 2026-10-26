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
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import FormSearchbar from '@ui/primitives/searchbar';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function VoicesCatalogSearch({
  search,
  onSearchChange,
}: VoicesCatalogSearchProps) {
  const translate = useTranslations('pages.adminVoices');

  return (
    <FormSearchbar
      ariaLabel={translate('searchPlaceholder')}
      isCollapsible
      onSearch={onSearchChange}
      placeholder={translate('searchPlaceholder')}
      size={ComponentSize.SM}
      value={search}
    />
  );
}

export function VoicesCatalogFilters({
  providerFilter,
  onProviderFilterChange,
}: VoicesCatalogFiltersProps) {
  const translate = useTranslations('pages.adminVoices');
  const providerFilters: Array<{ label: string; value: ProviderFilter }> = [
    { label: translate('providerAll'), value: 'all' },
    { label: translate('providerElevenLabs'), value: VoiceProvider.ELEVENLABS },
    { label: translate('providerHeyGen'), value: VoiceProvider.HEYGEN },
  ];

  return (
    <FilterMenu
      facets={[
        {
          defaultValue: 'all',
          key: 'provider',
          label: translate('providerLabel'),
          onChange: (value) => onProviderFilterChange(value as ProviderFilter),
          options: providerFilters,
          selection: 'single',
          value: providerFilter,
        },
      ]}
      onClear={() => onProviderFilterChange('all')}
    />
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
