'use client';

import { getBrandConfig } from '@genfeedai/constants';
import { ButtonVariant, RouterPriority } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
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
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, Sparkles } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

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
  selectionMode = 'multi',
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
  isDisabled = false,
  creditsAvailable = null,
}: ModelSelectorPopoverProps) {
  const isSingleSelect = selectionMode === 'single';
  const [isOpen, setIsOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSourceGroup, setActiveSourceGroup] = useState('all');
  const [expandedFamilyKeys, setExpandedFamilyKeys] = useState<string[]>([]);

  const isAutoSelected = values.includes(AUTO_MODEL_OPTION_VALUE);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const hasCreditLock =
    typeof creditsAvailable === 'number' && Number.isFinite(creditsAvailable);

  const isModelCreditLocked = useCallback(
    (model: { cost?: number | null; key: string }): boolean => {
      if (!hasCreditLock) {
        return false;
      }
      const cost =
        typeof model.cost === 'number' && Number.isFinite(model.cost)
          ? model.cost
          : 0;
      return cost > (creditsAvailable as number);
    },
    [creditsAvailable, hasCreditLock],
  );

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
      new Set(
        allOptions.flatMap((option) =>
          option.sourceGroup ? [option.sourceGroup] : [],
        ),
      ),
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

    const brandSlugs =
      activeBrand && activeBrand !== 'favorites'
        ? [activeBrand]
        : brands.map((brand) => brand.slug);

    return brandSlugs.reduce<GroupedFamilies>((acc, brandSlug) => {
      const families = groupedByBrand.get(brandSlug);
      if (!families) {
        return acc;
      }

      acc.push({
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
      });
      return acc;
    }, []);
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

  const displayedModels = selectedModels;

  // Always surface the real catalog when models exist — Auto mode used to hide
  // it (`!isAutoSelected`), which left a tall empty popover of priority-only
  // rows and made it impossible to pick a concrete model once Auto was on.
  const shouldShowManualCatalog = allOptions.length > 0;

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

  // Single-select chat pickers never show Auto priority cards unless a host
  // explicitly opts in with autoLabel (studio generation keeps the full surface).
  const shouldShowAutoCard =
    (!isSingleSelect || Boolean(autoLabel)) &&
    (isAutoSelected || shouldShowAuto);

  const handleToggle = useCallback(
    (modelKey: string) => {
      const lockedModel = models.find((entry) => entry.key === modelKey);
      if (lockedModel && isModelCreditLocked(lockedModel)) {
        return;
      }

      const currentValues = values.filter(
        (value) => value !== AUTO_MODEL_OPTION_VALUE,
      );

      if (isSingleSelect) {
        onChange(name, [modelKey]);
        setIsOpen(false);
        setSearchTerm('');
        return;
      }

      if (currentValues.includes(modelKey)) {
        onChange(
          name,
          currentValues.filter((value) => value !== modelKey),
        );
      } else {
        onChange(name, [...currentValues, modelKey]);
      }
    },
    [isModelCreditLocked, isSingleSelect, models, name, onChange, values],
  );

  const handleAutoSelect = useCallback(
    (priority: RouterPriority) => {
      onPrioritizeChange?.(priority);
      if (!isAutoSelected) {
        onChange(name, [AUTO_MODEL_OPTION_VALUE]);
      }
      setIsOpen(false);
    },
    [isAutoSelected, name, onChange, onPrioritizeChange],
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
      open={isDisabled ? false : isOpen}
      onOpenChange={(open) => {
        if (isDisabled) {
          return;
        }
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
          isAutoSelected={isAutoSelected}
          isOpen={isOpen}
          shouldFlash={shouldFlash}
          className={className}
          autoLabel={autoLabel}
          disabled={isDisabled}
          aria-disabled={isDisabled || undefined}
        />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        // Prefer the open side that still fits; empty shell used to fill 500px
        // and clip the top of the list against the browser chrome.
        avoidCollisions
        className={cn(
          'w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-popover p-0 shadow-dropdown',
          'sm:w-[380px]',
          // Radix measures free space above/below the trigger for this open.
          // Fall back to 70vh when the CSS var is missing (tests / non-Radix).
          'max-h-[min(480px,var(--radix-popover-content-available-height,70vh))]',
        )}
      >
        <div className="flex max-h-[inherit] min-h-0 w-full">
          {shouldShowManualCatalog && (
            <ModelSelectorProviderSidebar
              brands={brands}
              activeBrand={activeBrand}
              onBrandSelect={setActiveBrand}
              hasFavorites={hasFavorites}
            />
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {shouldShowManualCatalog && shouldShowSourceTabs && (
              <div className="shrink-0 overflow-x-auto border-b border-border px-3 py-2">
                <div className="inline-flex min-w-max rounded border border-border bg-background-secondary p-1">
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

            {/* No flex-1 on Command — that forced the panel to the max-h shell. */}
            <Command
              className="flex min-h-0 flex-col bg-transparent"
              shouldFilter={false}
            >
              {shouldShowManualCatalog && (
                <CommandInput
                  placeholder="Search models…"
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                />
              )}

              <CommandList
                className={cn(
                  'min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-1 py-1',
                  // Override command.tsx `max-h-dropdown` (300px) with viewport-aware cap.
                  // Height stays content-sized below the cap — no empty filler.
                  'max-h-[min(360px,calc(var(--radix-popover-content-available-height,70vh)-6rem))]',
                )}
              >
                {shouldShowAutoCard && (
                  <CommandGroup heading="Auto">
                    {AUTO_PRIORITY_OPTIONS.map((priorityOption) => (
                      <CommandItem
                        key={priorityOption}
                        value={AUTO_PRIORITY_LABELS[priorityOption]}
                        onSelect={() => handleAutoSelect(priorityOption)}
                        className={cn(
                          'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] text-foreground transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground lg:min-h-0',
                          isAutoSelected &&
                            priorityOption === prioritize &&
                            'bg-background-tertiary',
                        )}
                      >
                        <span
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-primary/10 text-primary">
                          <Sparkles className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {AUTO_PRIORITY_LABELS[priorityOption]}
                        </span>
                        {isAutoSelected && priorityOption === prioritize ? (
                          <Check className="size-3.5 shrink-0 text-foreground" />
                        ) : null}
                      </CommandItem>
                    ))}
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
                                isSingleSelect ||
                                familySearchMatch ||
                                expandedFamilyKeys.includes(family.familyKey);

                              return (
                                <div key={family.familyKey}>
                                  <ModelSelectorFamilyItem
                                    brandColor={brandConfig.color}
                                    brandIcon={getModelBrandIcon(
                                      brandConfig.iconKey,
                                    )}
                                    brandLabel={brandConfig.label}
                                    count={family.options.length}
                                    familyLabel={family.familyLabel}
                                    isExpanded={isExpanded}
                                    onToggle={() =>
                                      handleFamilyToggle(family.familyKey)
                                    }
                                  />

                                  {isExpanded && (
                                    <div>
                                      {family.options.map((option) => (
                                        <ModelSelectorModelItem
                                          key={option.model.key}
                                          option={option}
                                          isSelected={values.includes(
                                            option.model.key,
                                          )}
                                          isLocked={isModelCreditLocked(
                                            option.model,
                                          )}
                                          lockReason={
                                            isModelCreditLocked(option.model)
                                              ? `Needs ${option.model.cost} credits (you have ${creditsAvailable})`
                                              : undefined
                                          }
                                          onToggle={handleToggle}
                                          onFavoriteToggle={onFavoriteToggle}
                                          selectionMode={selectionMode}
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
        'min-h-11 rounded px-2.5 py-1.5 text-xs font-medium transition-colors lg:min-h-0',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground/55 hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
    </Button>
  );
}

export default ModelSelectorPopover;
