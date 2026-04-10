'use client';

import { getBrandConfig } from '@genfeedai/constants/model-brands.constant';
import { ButtonVariant, RouterPriority } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IModel } from '@genfeedai/interfaces';
import type { ModelSelectorPopoverProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorFamilyItem from '@ui/dropdowns/model-selector/ModelSelectorFamilyItem';
import ModelSelectorModelItem from '@ui/dropdowns/model-selector/ModelSelectorModelItem';
import ModelSelectorProviderSidebar from '@ui/dropdowns/model-selector/ModelSelectorProviderSidebar';
import ModelSelectorTrigger from '@ui/dropdowns/model-selector/ModelSelectorTrigger';
import {
  AUTO_MODEL_OPTION_VALUE,
  AUTO_PRIORITY_LABELS,
  AUTO_PRIORITY_OPTIONS,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  collectBrandsFromOptions,
  transformModelsToOptions,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@ui/primitives/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { memo, useCallback, useMemo, useState } from 'react';
import { HiCheck, HiSparkles } from 'react-icons/hi2';

const AUTO_MODEL = {
  key: AUTO_MODEL_OPTION_VALUE,
  label: 'Auto',
} as unknown as IModel;

type GroupedFamilies = Array<{
  brandSlug: string;
  families: Array<{
    familyKey: string;
    familyLabel: string;
    options: ReturnType<typeof transformModelsToOptions>[number][];
  }>;
}>;

type GroupedSection = {
  heading: string | undefined;
  key: 'current' | 'legacy';
  groups: GroupedFamilies;
};

function matchesSearch(text: string, searchTerm: string): boolean {
  return text.toLowerCase().includes(searchTerm);
}

const ModelSelectorPopover = memo(function ModelSelectorPopover({
  models,
  values,
  onChange,
  autoLabel,
  prioritize = RouterPriority.BALANCED,
  onPrioritizeChange,
  currentModelCategory,
  favoriteModelKeys,
  onFavoriteToggle,
  className,
  shouldFlash,
  buttonRef,
  name = 'models',
  sourceGroupResolver,
  sourceGroupLabels,
  autoSourceGroups,
}: ModelSelectorPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSourceGroup, setActiveSourceGroup] = useState('all');
  const [expandedFamilyKeys, setExpandedFamilyKeys] = useState<string[]>([]);

  const isAutoSelected = values.includes(AUTO_MODEL_OPTION_VALUE);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const allOptions = useMemo(
    () =>
      transformModelsToOptions(
        models.filter((model) =>
          currentModelCategory ? model.category === currentModelCategory : true,
        ),
        favoriteModelKeys,
        sourceGroupResolver,
      ),
    [models, favoriteModelKeys, sourceGroupResolver, currentModelCategory],
  );

  const brands = useMemo(
    () => collectBrandsFromOptions(allOptions),
    [allOptions],
  );

  const sourceGroups = useMemo(() => {
    const groups = Array.from(
      new Set(allOptions.map((option) => option.sourceGroup).filter(Boolean)),
    ) as string[];

    return groups.map((group) => ({
      id: group,
      label: sourceGroupLabels?.[group] ?? group,
    }));
  }, [allOptions, sourceGroupLabels]);

  const hasFavorites = favoriteModelKeys.length > 0;
  const shouldShowSourceTabs = sourceGroups.length > 1;

  const visibleOptions = useMemo(() => {
    let filtered = allOptions;

    if (activeSourceGroup !== 'all') {
      filtered = filtered.filter(
        (option) => option.sourceGroup === activeSourceGroup,
      );
    }

    if (activeBrand === 'favorites') {
      filtered = filtered.filter((option) => option.isFavorite);
    } else if (activeBrand) {
      filtered = filtered.filter((option) => option.brandSlug === activeBrand);
    }

    if (!normalizedSearchTerm) {
      return filtered;
    }

    const optionsByFamily = new Map<string, typeof filtered>();
    for (const option of filtered) {
      const familyOptions = optionsByFamily.get(option.familyKey) ?? [];
      familyOptions.push(option);
      optionsByFamily.set(option.familyKey, familyOptions);
    }

    const searched: typeof filtered = [];

    for (const familyOptions of optionsByFamily.values()) {
      const representative = familyOptions[0];
      const familyText = [representative.brandLabel, representative.familyLabel]
        .join(' ')
        .toLowerCase();

      const familyMatch = matchesSearch(familyText, normalizedSearchTerm);

      if (familyMatch) {
        searched.push(...familyOptions);
        continue;
      }

      searched.push(
        ...familyOptions.filter((option) =>
          matchesSearch(
            [
              option.brandLabel,
              option.familyLabel,
              option.variantLabel,
              option.model.label,
              option.model.description ?? '',
            ]
              .join(' ')
              .toLowerCase(),
            normalizedSearchTerm,
          ),
        ),
      );
    }

    return searched;
  }, [activeBrand, activeSourceGroup, allOptions, normalizedSearchTerm]);

  const groupedOptions = useMemo((): GroupedFamilies => {
    const groupedByBrand = new Map<
      string,
      Map<
        string,
        {
          familyLabel: string;
          options: ReturnType<typeof transformModelsToOptions>[number][];
        }
      >
    >();

    for (const option of visibleOptions) {
      const brandFamilies =
        groupedByBrand.get(option.brandSlug) ??
        new Map<
          string,
          {
            familyLabel: string;
            options: ReturnType<typeof transformModelsToOptions>[number][];
          }
        >();

      const family = brandFamilies.get(option.familyKey) ?? {
        familyLabel: option.familyLabel,
        options: [],
      };

      family.options.push(option);
      brandFamilies.set(option.familyKey, family);
      groupedByBrand.set(option.brandSlug, brandFamilies);
    }

    return (
      activeBrand && activeBrand !== 'favorites'
        ? [activeBrand]
        : brands.map((brand) => brand.slug)
    )
      .map((brandSlug) => {
        const families = groupedByBrand.get(brandSlug);
        if (!families) {
          return null;
        }

        return {
          brandSlug,
          families: Array.from(families.entries()).map(
            ([familyKey, familyData]) => ({
              familyKey,
              familyLabel: familyData.familyLabel,
              options: familyData.options.sort((left, right) =>
                left.variantLabel.localeCompare(right.variantLabel, undefined, {
                  numeric: true,
                }),
              ),
            }),
          ),
        };
      })
      .filter((group): group is GroupedFamilies[number] => group !== null);
  }, [activeBrand, brands, visibleOptions]);

  const groupedSections = useMemo((): GroupedSection[] => {
    const currentGroups: GroupedFamilies = [];
    const legacyGroups: GroupedFamilies = [];

    for (const group of groupedOptions) {
      const currentFamilies = group.families.filter((family) =>
        family.options.some((option) => !option.isDeprecated),
      );
      const legacyFamilies = group.families.filter((family) =>
        family.options.every((option) => option.isDeprecated),
      );

      if (currentFamilies.length > 0) {
        currentGroups.push({
          ...group,
          families: currentFamilies,
        });
      }

      if (legacyFamilies.length > 0) {
        legacyGroups.push({
          ...group,
          families: legacyFamilies,
        });
      }
    }

    const sections: GroupedSection[] = [
      {
        groups: currentGroups,
        heading: undefined,
        key: 'current',
      },
      {
        groups: legacyGroups,
        heading: 'Legacy',
        key: 'legacy',
      },
    ].filter((section): section is GroupedSection => section.groups.length > 0);

    return sections;
  }, [groupedOptions]);

  const selectedModels = useMemo(
    () =>
      models.filter(
        (model) =>
          values.includes(model.key) &&
          String(model.key) !== AUTO_MODEL_OPTION_VALUE,
      ),
    [models, values],
  );

  const displayedModels = useMemo(() => {
    if (isAutoSelected) {
      return [AUTO_MODEL];
    }

    return selectedModels;
  }, [isAutoSelected, selectedModels]);

  const shouldShowManualCatalog = !isAutoSelected;

  const shouldShowAuto = useMemo(() => {
    if (activeBrand === 'favorites') {
      return false;
    }

    if (sourceGroups.length === 0) {
      return true;
    }

    if (activeSourceGroup === 'all') {
      if (!autoSourceGroups || autoSourceGroups.length === 0) {
        return true;
      }

      return autoSourceGroups.some((group) =>
        sourceGroups.some((sourceGroup) => sourceGroup.id === group),
      );
    }

    return (autoSourceGroups ?? []).includes(activeSourceGroup);
  }, [activeBrand, activeSourceGroup, autoSourceGroups, sourceGroups]);

  const shouldShowAutoCard = isAutoSelected || shouldShowAuto;

  const handleToggle = useCallback(
    (modelKey: string) => {
      if (modelKey === AUTO_MODEL_OPTION_VALUE) {
        if (isAutoSelected) {
          onChange(
            name,
            values.filter((value) => value !== AUTO_MODEL_OPTION_VALUE),
          );
        } else {
          onChange(name, [AUTO_MODEL_OPTION_VALUE]);
        }
        return;
      }

      const currentValues = values.filter(
        (value) => value !== AUTO_MODEL_OPTION_VALUE,
      );

      if (currentValues.includes(modelKey)) {
        onChange(
          name,
          currentValues.filter((value) => value !== modelKey),
        );
      } else {
        onChange(name, [...currentValues, modelKey]);
      }
    },
    [isAutoSelected, name, onChange, values],
  );

  const handleFamilyToggle = useCallback((familyKey: string) => {
    setExpandedFamilyKeys((currentKeys) =>
      currentKeys.includes(familyKey)
        ? currentKeys.filter((key) => key !== familyKey)
        : [...currentKeys, familyKey],
    );
  }, []);

  const hasVisibleFamilies = groupedOptions.some(
    (group) => group.families.length > 0,
  );

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchTerm('');
          setActiveSourceGroup('all');
        }
      }}
    >
      <PopoverTrigger asChild>
        <ModelSelectorTrigger
          ref={buttonRef}
          selectedModels={displayedModels}
          isOpen={isOpen}
          shouldFlash={shouldFlash}
          className={className}
          autoLabel={autoLabel}
        />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className={cn(
          'p-0 bg-[#141414] border border-white/10 rounded-lg overflow-hidden',
          shouldShowManualCatalog ? 'w-[440px]' : 'w-[320px]',
        )}
      >
        <div className={cn('flex', shouldShowManualCatalog && 'h-[500px]')}>
          {shouldShowManualCatalog && (
            <ModelSelectorProviderSidebar
              brands={brands}
              activeBrand={activeBrand}
              onBrandSelect={setActiveBrand}
              hasFavorites={hasFavorites}
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {shouldShowManualCatalog && shouldShowSourceTabs && (
              <div className="border-b border-white/8 px-3 py-2">
                <div className="inline-flex rounded border border-white/8 bg-white/[0.03] p-1">
                  <SourceTabButton
                    isActive={activeSourceGroup === 'all'}
                    label="All"
                    onClick={() => setActiveSourceGroup('all')}
                  />
                  {sourceGroups.map((group) => (
                    <SourceTabButton
                      key={group.id}
                      isActive={activeSourceGroup === group.id}
                      label={group.label}
                      onClick={() => setActiveSourceGroup(group.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <Command className="bg-transparent" shouldFilter={false}>
              {shouldShowManualCatalog && (
                <CommandInput
                  placeholder="Search models..."
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                />
              )}

              <CommandList
                className={cn(
                  'max-h-none flex-1 px-2 py-2',
                  shouldShowManualCatalog && 'overflow-y-auto',
                )}
              >
                {shouldShowAutoCard && (
                  <CommandGroup heading="Auto">
                    <div className="mb-1 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                      <div
                        className={cn(
                          'transition-colors',
                          isAutoSelected && 'bg-primary/10',
                        )}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggle(AUTO_MODEL_OPTION_VALUE)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleToggle(AUTO_MODEL_OPTION_VALUE);
                            }
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded px-3 py-3 text-left transition-colors',
                            'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded-sm border transition-colors',
                              isAutoSelected
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-white/20 bg-transparent text-transparent',
                            )}
                          >
                            <HiCheck className="h-3 w-3" />
                          </div>
                          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-primary">
                            <HiSparkles className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">
                              Auto
                            </div>
                            <div className="text-xs text-foreground/50">
                              Optimize for {AUTO_PRIORITY_LABELS[prioritize]}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isAutoSelected && onPrioritizeChange && (
                        <div className="space-y-2 border-t border-white/[0.04] px-3 pb-3 pt-2">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-foreground/50">
                            Priority
                          </div>
                          <Select
                            value={prioritize}
                            onValueChange={(value) =>
                              onPrioritizeChange(value as RouterPriority)
                            }
                          >
                            <SelectTrigger
                              aria-label="Auto routing priority"
                              className="h-9 border-white/10 bg-white/[0.03] text-sm"
                            >
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {AUTO_PRIORITY_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {AUTO_PRIORITY_LABELS[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </CommandGroup>
                )}

                {shouldShowManualCatalog &&
                  groupedSections.map((section) => (
                    <CommandGroup key={section.key} heading={section.heading}>
                      {section.groups.map(({ brandSlug, families }) => {
                        const brandConfig = getBrandConfig(brandSlug);
                        return (
                          <CommandGroup
                            key={`${section.key}-${brandSlug}`}
                            heading={
                              activeBrand === null ||
                              activeBrand === 'favorites'
                                ? brandConfig.label
                                : undefined
                            }
                          >
                            {families.map((family) => {
                              const familySearchMatch = normalizedSearchTerm
                                ? [
                                    brandConfig.label,
                                    family.familyLabel,
                                    ...family.options.map(
                                      (option) => option.variantLabel,
                                    ),
                                  ]
                                    .join(' ')
                                    .toLowerCase()
                                    .includes(normalizedSearchTerm)
                                : false;

                              const isExpanded =
                                familySearchMatch ||
                                expandedFamilyKeys.includes(family.familyKey);

                              return (
                                <div
                                  key={family.familyKey}
                                  className="mb-1 rounded-lg border border-white/[0.04] bg-white/[0.02]"
                                >
                                  <ModelSelectorFamilyItem
                                    brandColor={brandConfig.color}
                                    brandIcon={brandConfig.icon}
                                    brandLabel={brandConfig.label}
                                    count={family.options.length}
                                    familyLabel={family.familyLabel}
                                    isExpanded={isExpanded}
                                    onToggle={() =>
                                      handleFamilyToggle(family.familyKey)
                                    }
                                  />

                                  {isExpanded && (
                                    <div className="space-y-0.5 px-2 pb-2">
                                      {family.options.map((option) => (
                                        <ModelSelectorModelItem
                                          key={option.model.key}
                                          option={option}
                                          isSelected={values.includes(
                                            option.model.key,
                                          )}
                                          onToggle={handleToggle}
                                          onFavoriteToggle={onFavoriteToggle}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </CommandGroup>
                        );
                      })}
                    </CommandGroup>
                  ))}

                {shouldShowManualCatalog && !hasVisibleFamilies && (
                  <CommandEmpty>No models found</CommandEmpty>
                )}

                {!shouldShowManualCatalog && !shouldShowAutoCard && (
                  <CommandEmpty>No auto options available</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

function SourceTabButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      className={cn(
        'rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
        isActive
          ? 'bg-white/[0.09] text-foreground'
          : 'text-foreground/55 hover:text-foreground hover:bg-white/[0.05]',
      )}
    >
      {label}
    </Button>
  );
}

export default ModelSelectorPopover;
