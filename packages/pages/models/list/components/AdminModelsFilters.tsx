'use client';

import {
  ButtonSize,
  ButtonVariant,
  ModelCategory,
  ModelProvider,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import {
  type AdminModelsFiltersProps,
  resolveAdminModelFilters,
} from '@props/admin/models.props';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { ToggleGroup, ToggleGroupItem } from '@ui/primitives/toggle-group';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function AdminModelsFilters({
  category,
}: AdminModelsFiltersProps) {
  const translate = useTranslations('pages.models');
  const params = useSearchParams();
  const { replace } = useRouter();
  const filters = resolveAdminModelFilters(
    new URLSearchParams(params.toString()),
    category,
  );
  function handleChange(name: string, values: string[]) {
    const next = new URLSearchParams(params.toString());
    // Materialize legacy type links before switching to independent filters.
    next.delete('type');
    next.delete('category');
    next.delete('provider');
    next.delete('status');
    for (const [key, selected] of Object.entries({
      category: filters.categories,
      provider: filters.providers,
      status: filters.statuses,
    })) {
      const entries = name === 'clear' ? [] : key === name ? values : selected;
      if (key === 'status' && entries.length === 0) next.set('status', 'all');
      else for (const value of entries) next.append(key, value);
    }
    next.delete('page');
    replace(`${APP_ROUTES.ADMIN.AUTOMATION.MODELS}?${next.toString()}`, {
      scroll: false,
    });
  }
  const groups = [
    {
      name: 'category',
      label: translate('filterCategories'),
      values: filters.categories,
      options: Object.values(ModelCategory).map((value) => ({
        value,
        label: value
          .replaceAll('-', ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      })),
    },
    {
      name: 'provider',
      label: translate('filterProviders'),
      values: filters.providers,
      options: Object.values(ModelProvider).map((value) => ({
        value,
        label: getModelProviderLabel(value),
      })),
    },
    {
      name: 'status',
      label: translate('filterStatus'),
      values: filters.statuses,
      options: [
        { value: 'active', label: translate('active') },
        { value: 'inactive', label: translate('inactive') },
      ],
    },
  ];
  const activeCount = groups.reduce(
    (count, group) => count + group.values.length,
    0,
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          icon={<SlidersHorizontal className={SHELL_ICON_CLASS} />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('filters')}
          {activeCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="rounded-full bg-foreground px-1.5 text-2xs font-semibold text-background"
              >
                {activeCount}
              </span>
              <span className="sr-only">
                {translate('activeFilterCount', { count: activeCount })}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverPanelContent align="end" className="w-96 max-w-[90vw] p-0">
        <div className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col gap-4 overflow-y-auto p-4">
          {groups.map((group) => (
            <section
              aria-label={group.label}
              className="flex flex-col gap-2"
              key={group.name}
            >
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.label}
              </h3>
              <ToggleGroup
                aria-label={group.label}
                className="flex flex-wrap justify-start gap-1.5"
                onValueChange={(values) => handleChange(group.name, values)}
                size="sm"
                type="multiple"
                value={group.values}
              >
                {group.options.map((option) => (
                  <ToggleGroupItem
                    className="h-8 min-w-0 rounded-full border border-border px-2.5 text-xs font-medium data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </section>
          ))}
          <Button
            isDisabled={activeCount === 0}
            onClick={() => handleChange('clear', [])}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('clearFilters')}
          </Button>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
