'use client';

import {
  ButtonVariant,
  ModelLifecycle,
  RouterPriority,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ModelSelectorFilter,
  ModelSelectorOption,
  ModelSelectorPopoverProps,
} from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorFilterPills from '@ui/dropdowns/model-selector/ModelSelectorFilterPills';
import ModelSelectorModelItem from '@ui/dropdowns/model-selector/ModelSelectorModelItem';
import ModelSelectorTrigger from '@ui/dropdowns/model-selector/ModelSelectorTrigger';
import {
  AUTO_MODEL_OPTION_VALUE,
  AUTO_PRIORITY_LABELS,
  AUTO_PRIORITY_OPTIONS,
  MODEL_CAPABILITY_FILTERS,
  MODEL_CATEGORY_AUTO,
  MODEL_CATEGORY_AUTO_OPTION,
  MODEL_CATEGORY_CATALOG,
  MODEL_CATEGORY_CATALOG_OPTION,
  MODEL_FILTER_ALL_OPTION,
  MODEL_LEGACY_FILTER,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  getSourceFilterGroup,
  isSourceFilter,
  MODEL_FILTER_ALL,
  MODEL_FILTER_SOURCE_PREFIX,
  matchesModelFilter,
  matchesModelSearch,
  orderOptionsByKeys,
  sortModelOptions,
  transformModelsToOptions,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { useModelRecents } from '@ui/dropdowns/model-selector/useModelRecents';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Check, Sparkles } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

type ModelSelectorSection = {
  key: string;
  heading: string | undefined;
  options: ModelSelectorOption[];
};

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
  contextLabel,
  contextOptions = [],
  contextValue,
  onContextChange,
}: ModelSelectorPopoverProps) {
  const isSingleSelect = selectionMode === 'single';
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(MODEL_FILTER_ALL);
  const [activeCapabilityFilterId, setActiveCapabilityFilterId] = useState<
    string | null
  >(null);
  const { recentModelKeys, onModelUsed } = useModelRecents();

  useEffect(() => {
    if (!isDisabled) {
      return;
    }

    setIsOpen(false);
    setSearchTerm('');
    setActiveCategoryId(MODEL_FILTER_ALL);
    setActiveCapabilityFilterId(null);
  }, [isDisabled]);

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
      sortModelOptions(
        transformModelsToOptions(
          models.filter(
            (model) =>
              model.lifecycle !== ModelLifecycle.RETIRED &&
              (currentModelCategory
                ? model.category === currentModelCategory
                : true),
          ),
          favoriteModelKeys,
          sourceGroupResolver,
        ),
      ),
    [models, favoriteModelKeys, sourceGroupResolver, currentModelCategory],
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

  const orderedSourceGroups = useMemo(() => {
    const catalogGroups = new Set(autoSourceGroups ?? []);

    return [...sourceGroups].sort((left, right) => {
      const leftIsCatalog = catalogGroups.has(left.id);
      const rightIsCatalog = catalogGroups.has(right.id);

      if (leftIsCatalog === rightIsCatalog) {
        return left.label.localeCompare(right.label);
      }

      // Custom/brand models precede the broad catalog, matching the picker IA.
      return leftIsCatalog ? 1 : -1;
    });
  }, [autoSourceGroups, sourceGroups]);

  const hasLegacy = allOptions.some((option) => option.isDeprecated);

  const hasAutoEligibleSource =
    !autoSourceGroups ||
    autoSourceGroups.length === 0 ||
    sourceGroups.length === 0 ||
    autoSourceGroups.some((group) =>
      sourceGroups.some((sourceGroup) => sourceGroup.id === group),
    );
  const canSelectAuto =
    allOptions.some(
      (option) =>
        option.lifecycle === ModelLifecycle.RECOMMENDED &&
        option.model.isFree !== true &&
        typeof option.model.cost === 'number' &&
        option.model.cost > 0 &&
        (!option.model.isDiscovered ||
          option.model.reviewStatus === 'approved'),
    ) &&
    hasAutoEligibleSource &&
    (!isSingleSelect || Boolean(autoLabel));

  const categoryFilters = useMemo((): ModelSelectorFilter[] => {
    const nextFilters: ModelSelectorFilter[] = [MODEL_FILTER_ALL_OPTION];

    if (canSelectAuto) {
      nextFilters.push(MODEL_CATEGORY_AUTO_OPTION);
    }

    if (orderedSourceGroups.length === 0) {
      nextFilters.push(MODEL_CATEGORY_CATALOG_OPTION);
    } else {
      for (const sourceGroup of orderedSourceGroups) {
        nextFilters.push({
          id: `${MODEL_FILTER_SOURCE_PREFIX}${sourceGroup.id}`,
          label: sourceGroup.label,
        });
      }
    }

    return nextFilters;
  }, [canSelectAuto, orderedSourceGroups]);

  // Every capability has to earn its slot: a filter nobody can satisfy is a
  // dead control that costs the same horizontal space as a useful one.
  const capabilityFilters = useMemo((): ModelSelectorFilter[] => {
    const nextFilters: ModelSelectorFilter[] = [];

    for (const capabilityFilter of MODEL_CAPABILITY_FILTERS) {
      const hasMatch = allOptions.some((option) =>
        matchesModelFilter(option, capabilityFilter.id),
      );
      if (hasMatch) {
        nextFilters.push(capabilityFilter);
      }
    }

    if (hasLegacy) {
      nextFilters.push(MODEL_LEGACY_FILTER);
    }

    return nextFilters;
  }, [allOptions, hasLegacy]);

  // A catalog swap (image ⇄ video) can retire an active chip mid-session.
  const effectiveCategoryId = categoryFilters.some(
    (filter) => filter.id === activeCategoryId,
  )
    ? activeCategoryId
    : MODEL_FILTER_ALL;

  const effectiveCapabilityFilterId = capabilityFilters.some(
    (filter) => filter.id === activeCapabilityFilterId,
  )
    ? activeCapabilityFilterId
    : null;

  const isAutoCategory = effectiveCategoryId === MODEL_CATEGORY_AUTO;

  const categoryOptions = useMemo(() => {
    if (isAutoCategory) {
      return [];
    }

    if (
      effectiveCategoryId === MODEL_FILTER_ALL ||
      effectiveCategoryId === MODEL_CATEGORY_CATALOG
    ) {
      return allOptions;
    }

    if (isSourceFilter(effectiveCategoryId)) {
      const sourceGroup = getSourceFilterGroup(effectiveCategoryId);
      return allOptions.filter((option) => option.sourceGroup === sourceGroup);
    }

    return allOptions;
  }, [allOptions, effectiveCategoryId, isAutoCategory]);

  const catalogOptions = useMemo(
    () =>
      categoryOptions.filter((option) =>
        matchesModelFilter(
          option,
          effectiveCapabilityFilterId ?? MODEL_FILTER_ALL,
        ),
      ),
    [categoryOptions, effectiveCapabilityFilterId],
  );

  // Search reaches past the "All" pill's legacy exclusion — someone typing a
  // legacy model's name is looking for exactly that model.
  const searchResults = useMemo(() => {
    if (!normalizedSearchTerm) {
      return [];
    }

    const searchPool = effectiveCapabilityFilterId
      ? catalogOptions
      : categoryOptions;

    return searchPool.filter((option) =>
      matchesModelSearch(option, normalizedSearchTerm),
    );
  }, [
    catalogOptions,
    categoryOptions,
    effectiveCapabilityFilterId,
    normalizedSearchTerm,
  ]);

  // Sections never overlap: a model appears once, so scanning the list is a
  // single pass and cmdk keeps one row per value.
  const sections = useMemo((): ModelSelectorSection[] => {
    if (normalizedSearchTerm) {
      return searchResults.length > 0
        ? [{ heading: undefined, key: 'results', options: searchResults }]
        : [];
    }

    const favoriteOptions = catalogOptions.filter(
      (option) => option.isFavorite,
    );
    const favoriteKeys = new Set(
      favoriteOptions.map((option) => option.model.key),
    );

    const recentOptions = orderOptionsByKeys(
      catalogOptions.filter(
        (option) =>
          !favoriteKeys.has(option.model.key) &&
          recentModelKeys.includes(option.model.key),
      ),
      recentModelKeys,
    );
    const recentKeys = new Set(recentOptions.map((option) => option.model.key));

    const remainingOptions = catalogOptions.filter(
      (option) =>
        !favoriteKeys.has(option.model.key) &&
        !recentKeys.has(option.model.key),
    );

    const rankedSections: ModelSelectorSection[] = [
      { heading: 'Favorites', key: 'favorites', options: favoriteOptions },
      { heading: 'Recent', key: 'recent', options: recentOptions },
    ].filter((section) => section.options.length > 0);

    const activeCategoryLabel = categoryFilters.find(
      (filter) => filter.id === effectiveCategoryId,
    )?.label;

    if (effectiveCapabilityFilterId === MODEL_LEGACY_FILTER.id) {
      return [
        ...rankedSections,
        { heading: 'Legacy', key: 'legacy', options: remainingOptions },
      ].filter((section) => section.options.length > 0);
    }

    return [
      ...rankedSections,
      {
        heading: 'Recommended',
        key: 'recommended',
        options: remainingOptions.filter(
          (option) => option.lifecycle === ModelLifecycle.RECOMMENDED,
        ),
      },
      {
        heading:
          effectiveCategoryId === MODEL_FILTER_ALL
            ? 'More Models'
            : activeCategoryLabel,
        key: 'more-models',
        options: remainingOptions.filter(
          (option) => option.lifecycle !== ModelLifecycle.RECOMMENDED,
        ),
      },
    ].filter((section) => section.options.length > 0);
  }, [
    catalogOptions,
    categoryFilters,
    effectiveCategoryId,
    effectiveCapabilityFilterId,
    normalizedSearchTerm,
    recentModelKeys,
    searchResults,
  ]);

  const selectedModels = useMemo(
    () =>
      models.filter(
        (model) =>
          values.includes(model.key) &&
          String(model.key) !== AUTO_MODEL_OPTION_VALUE,
      ),
    [models, values],
  );
  const activeContext = contextOptions.find(
    (option) => option.value === contextValue,
  );

  // Always surface the real catalog when models exist — Auto mode used to hide
  // it (`!isAutoSelected`), which left a tall empty popover of priority-only
  // rows and made it impossible to pick a concrete model once Auto was on.
  const shouldShowManualCatalog = allOptions.length > 0;
  const shouldShowManualRows = shouldShowManualCatalog && !isAutoCategory;

  const shouldShowAuto =
    (effectiveCategoryId === MODEL_FILTER_ALL || isAutoCategory) &&
    !effectiveCapabilityFilterId;

  const visibleAutoPriorities = useMemo(() => {
    if (!normalizedSearchTerm) {
      return AUTO_PRIORITY_OPTIONS;
    }

    return AUTO_PRIORITY_OPTIONS.filter((priorityOption) =>
      `auto ${AUTO_PRIORITY_LABELS[priorityOption]}`
        .toLowerCase()
        .includes(normalizedSearchTerm),
    );
  }, [normalizedSearchTerm]);

  // Single-select chat pickers never show Auto priority cards unless a host
  // explicitly opts in with autoLabel (studio generation keeps the full surface).
  // An empty allowlist must not offer Auto — confirm would 403 in RouterService.
  const shouldShowAutoCard =
    canSelectAuto && shouldShowAuto && visibleAutoPriorities.length > 0;

  const handleToggle = useCallback(
    (modelKey: string) => {
      const lockedModel = models.find((entry) => entry.key === modelKey);
      if (lockedModel?.lifecycle === ModelLifecycle.RETIRED) {
        return;
      }
      if (lockedModel && isModelCreditLocked(lockedModel)) {
        return;
      }

      const currentValues = values.filter(
        (value) => value !== AUTO_MODEL_OPTION_VALUE,
      );

      if (isSingleSelect) {
        onModelUsed(modelKey);
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
        onModelUsed(modelKey);
        onChange(name, [...currentValues, modelKey]);
      }
    },
    [
      isModelCreditLocked,
      isSingleSelect,
      models,
      name,
      onChange,
      onModelUsed,
      values,
    ],
  );

  const handleAutoSelect = useCallback(
    (priority: RouterPriority) => {
      // Always emit Auto + priority. Skipping onChange when already Auto left
      // hosts that only listen to one of the two callbacks stuck on a concrete
      // model label in the trigger.
      onPrioritizeChange?.(priority);
      onChange(name, [AUTO_MODEL_OPTION_VALUE]);
      setIsOpen(false);
      setSearchTerm('');
    },
    [name, onChange, onPrioritizeChange],
  );

  const hasVisibleRows = sections.length > 0 || shouldShowAutoCard;

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
          setActiveCategoryId(MODEL_FILTER_ALL);
          setActiveCapabilityFilterId(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <ModelSelectorTrigger
          ref={buttonRef}
          selectedModels={selectedModels}
          isAutoSelected={isAutoSelected}
          isOpen={isOpen}
          shouldFlash={shouldFlash}
          className={className}
          autoLabel={autoLabel}
          context={activeContext}
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
        onOpenAutoFocus={(event) => {
          const popoverContent = event.currentTarget;
          if (!(popoverContent instanceof HTMLElement)) {
            return;
          }

          const searchInput = popoverContent.querySelector('input');
          if (searchInput instanceof HTMLElement) {
            event.preventDefault();
            searchInput.focus();
          }
        }}
        className={cn(
          overlayMenuSurfaceClassName,
          'w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0',
          'sm:w-[380px]',
          // Radix measures free space above/below the trigger for this open.
          // Fall back to 70vh when the CSS var is missing (tests / non-Radix).
          'max-h-[min(480px,var(--radix-popover-content-available-height,70vh))]',
        )}
      >
        {/* Hover, not focus: cmdk keeps DOM focus on the search input and moves
            an aria-activedescendant, so a focus-triggered panel never fires
            during arrow-key navigation. */}
        <TooltipProvider delayDuration={400} disableHoverableContent>
          <div className="flex max-h-[inherit] min-h-0 w-full flex-col bg-secondary">
            {contextLabel && contextOptions.length > 0 ? (
              <div
                aria-label={contextLabel}
                className="grid shrink-0 grid-cols-3 gap-1 border-b border-border bg-secondary p-1.5"
                role="group"
              >
                {contextOptions.map((option) => {
                  const ContextIcon = option.icon;
                  const isActive = option.value === contextValue;

                  return (
                    <Button
                      aria-pressed={isActive}
                      ariaLabel={option.label}
                      className={cn(
                        'flex h-auto min-w-0 items-start justify-start gap-2 rounded-md px-2 py-2 text-left',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent/60',
                      )}
                      key={option.value}
                      onClick={() => {
                        onContextChange?.(option.value);
                        setActiveCategoryId(MODEL_FILTER_ALL);
                        setActiveCapabilityFilterId(null);
                        setSearchTerm('');
                      }}
                      textTransform="none"
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                    >
                      {ContextIcon ? (
                        <ContextIcon
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0"
                        />
                      ) : null}
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.description ? (
                          <span className="mt-0.5 block line-clamp-2 text-2xs leading-4 text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
            {/* No flex-1 on Command — that forced the panel to the max-h shell. */}
            <Command
              className="flex min-h-0 flex-col bg-secondary text-foreground"
              shouldFilter={false}
            >
              {shouldShowManualCatalog && (
                <CommandInput
                  placeholder="Search models…"
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                  className={cn(
                    // Ship CommandInput defaults to muted-on-muted and reads as
                    // empty grey chrome on dark agent surfaces — force tokens.
                    'h-8 border-0 border-b border-border bg-secondary px-2 text-foreground',
                    'placeholder:text-muted-foreground',
                    '[&_input]:h-8 [&_input]:px-1.5 [&_input]:!text-foreground',
                    '[&_input]:placeholder:!text-muted-foreground',
                  )}
                />
              )}

              {shouldShowManualCatalog ? (
                <ModelSelectorFilterPills
                  categoryFilters={categoryFilters}
                  activeCategoryId={effectiveCategoryId}
                  onCategorySelect={(categoryId) => {
                    setActiveCategoryId(categoryId);
                    if (categoryId === MODEL_CATEGORY_AUTO) {
                      setActiveCapabilityFilterId(null);
                    }
                  }}
                  capabilityFilters={capabilityFilters}
                  activeCapabilityFilterId={effectiveCapabilityFilterId}
                  onCapabilityFilterSelect={(filterId) => {
                    setActiveCapabilityFilterId((currentFilterId) =>
                      currentFilterId === filterId ? null : filterId,
                    );
                    if (isAutoCategory) {
                      setActiveCategoryId(MODEL_FILTER_ALL);
                    }
                  }}
                />
              ) : null}

              <CommandList
                className={cn(
                  'min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-0.5',
                  // Override command.tsx `max-h-dropdown` (300px) with viewport-aware cap.
                  // Height stays content-sized below the cap — no empty filler.
                  'max-h-[min(360px,calc(var(--radix-popover-content-available-height,70vh)-5rem))]',
                )}
              >
                {shouldShowAutoCard && (
                  <CommandGroup heading="Auto" className="p-0.5">
                    {visibleAutoPriorities.map((priorityOption) => (
                      <CommandItem
                        key={priorityOption}
                        value={`auto ${AUTO_PRIORITY_LABELS[priorityOption]}`}
                        // cmdk onSelect + pointer — some nested group layouts
                        // drop keyboard-only select for the first click.
                        onSelect={() => handleAutoSelect(priorityOption)}
                        onPointerDown={(event) => {
                          // Prevent cmdk from eating the click without selecting.
                          if (event.button !== 0) {
                            return;
                          }
                          event.preventDefault();
                          handleAutoSelect(priorityOption);
                        }}
                        className={cn(
                          'flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                          isAutoSelected &&
                            priorityOption === prioritize &&
                            'bg-background-tertiary',
                        )}
                      >
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

                {shouldShowManualRows &&
                  sections.map((section) => (
                    <CommandGroup key={section.key} heading={section.heading}>
                      {section.options.map((option) => (
                        <ModelSelectorModelItem
                          key={option.model.key}
                          option={option}
                          isSelected={values.includes(option.model.key)}
                          isLocked={isModelCreditLocked(option.model)}
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
                    </CommandGroup>
                  ))}

                {shouldShowManualCatalog && !hasVisibleRows && (
                  <CommandEmpty>No models found</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

export default ModelSelectorPopover;
