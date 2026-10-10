'use client';

import {
  ButtonVariant,
  ModelLifecycle,
  PricingType,
  QualityTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import {
  getQualityTierForModel,
  getQualityTierLabel,
} from '@genfeedai/helpers/quality-routing.helper';
import {
  CREDIT_VALUE_DOLLARS,
  resolveProviderCostUnits,
} from '@genfeedai/pricing';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import ModelSelectorQualityBar from '@ui/dropdowns/model-selector/ModelSelectorQualityBar';
import ModelAvatar from '@ui/models/ModelAvatar';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';

export type ModelsTableTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type BuildModelsTableColumnsParams = {
  isAdminScope: boolean;
  isModelEnabled: (modelId: string) => boolean;
  isOnlyDefaultInCategory: (model: IModel) => boolean;
  handleAdminToggle: (model: IModel, field: 'isDefault') => void;
  handleLifecycleChange: (
    model: IModel,
    lifecycle: ModelLifecycle,
    succeededBy?: string,
  ) => void;
  handleToggleModel: (model: IModel, enabled: boolean) => void;
  onOpenDetails: (model: IModel) => void;
  togglingModelId: string | null;
  models: IModel[];
  translate: ModelsTableTranslate;
};

const BREAKDOWN_PRICING_TYPES = new Set<string>([
  PricingType.FLAT,
  PricingType.PER_SECOND,
  PricingType.PER_MEGAPIXEL,
]);

/** Paid rows with a missing or non-positive credit price stay off promotion. */
function isPaidModelPricingLocked(model: IModel): boolean {
  if (model.isFree === true) return false;
  if (model.pricingType === 'conditional')
    return model.hasReviewedPricing !== true;
  return (
    model.isFree !== true && (!Number.isFinite(model.cost) || model.cost <= 0)
  );
}

function isPromotedLifecycle(lifecycle: ModelLifecycle): boolean {
  return (
    lifecycle === ModelLifecycle.AVAILABLE ||
    lifecycle === ModelLifecycle.RECOMMENDED
  );
}

function hasPositiveFiniteCost(
  value: number | null | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasBreakdownPricingType(
  pricingType: string | null | undefined,
): boolean {
  if (pricingType == null || pricingType.length === 0) {
    return true;
  }

  return BREAKDOWN_PRICING_TYPES.has(pricingType);
}

function formatUsdAmount(amount: number): string {
  const rounded = Math.round(amount * 1e8) / 1e8;

  return rounded.toLocaleString('en-US', {
    currency: 'USD',
    maximumFractionDigits: 8,
    minimumFractionDigits: 2,
    style: 'currency',
  });
}

function formatPricingBasis(
  model: IModel,
  units: number,
  translate: ModelsTableTranslate,
): string | null {
  if (model.pricingType === PricingType.PER_SECOND) {
    return translate('table.costBasisPerSecond', {
      duration: units.toLocaleString('en-US'),
      unit:
        units === 1
          ? translate('table.secondUnit')
          : translate('table.secondsUnit'),
    });
  }

  if (model.pricingType === PricingType.PER_MEGAPIXEL) {
    return translate('table.costBasisPerMegapixel', {
      units: units.toLocaleString('en-US'),
    });
  }

  return null;
}

function formatAdminCostTooltip(
  model: IModel,
  translate: ModelsTableTranslate,
): string {
  if (model.isFree === true) {
    return translate('table.costFree');
  }

  if (isPaidModelPricingLocked(model)) {
    return `${translate('table.pricingUnavailable')}. ${translate(
      'table.pricingLockedReason',
    )}`;
  }

  if (model.pricingType === 'conditional' && model.hasReviewedPricing)
    return translate('table.variablePricingDescription');

  const providerCostUsd = model.providerCostUsd;
  const credits = Number.isFinite(model.cost)
    ? model.cost.toLocaleString('en-US')
    : '';

  if (
    !hasBreakdownPricingType(model.pricingType) ||
    !hasPositiveFiniteCost(providerCostUsd) ||
    !hasPositiveFiniteCost(model.cost)
  ) {
    return translate('table.providerBreakdownUnavailable', { credits });
  }

  // Canonical one-megapixel unit. Dimensions are not inferred.
  const units = resolveProviderCostUnits(
    model.pricingType,
    model.defaultDuration,
  );
  const providerUsd = providerCostUsd * units;
  const totalUsd = model.cost * CREDIT_VALUE_DOLLARS;
  const equation = translate('table.costBreakdown', {
    base: formatUsdAmount(providerUsd),
    credits,
    margin: formatUsdAmount(totalUsd - providerUsd),
    total: formatUsdAmount(totalUsd),
  });
  const basis = formatPricingBasis(model, units, translate);

  return basis ? `${equation} ${basis}` : equation;
}

function ModelLifecycleControl({
  model,
  models,
  isDisabled,
  onChange,
  translate,
}: {
  isDisabled: boolean;
  model: IModel;
  models: IModel[];
  onChange: (lifecycle: ModelLifecycle, succeededBy?: string) => void;
  translate: ModelsTableTranslate;
}) {
  const [pendingLifecycle, setPendingLifecycle] =
    useState<ModelLifecycle | null>(null);
  const lifecycle =
    pendingLifecycle ?? model.lifecycle ?? ModelLifecycle.AVAILABLE;
  const isChoosingSuccessor =
    pendingLifecycle === ModelLifecycle.LEGACY ||
    pendingLifecycle === ModelLifecycle.RETIRED;
  const successors = models.filter(
    (candidate) =>
      candidate.id !== model.id &&
      candidate.category === model.category &&
      candidate.isActive &&
      candidate.lifecycle !== ModelLifecycle.RETIRED,
  );
  const successorLabel = models.find(
    (candidate) => candidate.key === model.succeededBy,
  )?.label;
  const isPricingLocked = isPaidModelPricingLocked(model);
  const pricingLockedReason = isPricingLocked
    ? translate('table.pricingLockedReason')
    : undefined;

  return (
    <div className="flex min-w-32 flex-col gap-1">
      <Select
        disabled={isDisabled}
        value={lifecycle}
        onValueChange={(value) => {
          const next = value as ModelLifecycle;
          if (isPricingLocked && isPromotedLifecycle(next)) {
            return;
          }
          if (
            next === ModelLifecycle.LEGACY ||
            next === ModelLifecycle.RETIRED
          ) {
            if (model.succeededBy) {
              setPendingLifecycle(null);
              onChange(next, model.succeededBy);
              return;
            }
            setPendingLifecycle(next);
            return;
          }
          setPendingLifecycle(null);
          onChange(next);
        }}
      >
        <SelectTrigger
          aria-description={pricingLockedReason}
          aria-label={`Lifecycle for ${model.label}`}
          className="h-8 w-full min-w-32"
          title={pricingLockedReason}
        >
          {isPricingLocked ? (
            <LockKeyhole
              aria-hidden="true"
              className="size-3 shrink-0 text-muted-foreground"
            />
          ) : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(ModelLifecycle).map((value) => (
            <SelectItem
              key={value}
              disabled={isPricingLocked && isPromotedLifecycle(value)}
              value={value}
            >
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isChoosingSuccessor ? (
        <Select
          disabled={isDisabled}
          value={model.succeededBy}
          onValueChange={(successorKey) => {
            onChange(lifecycle, successorKey);
            setPendingLifecycle(null);
          }}
        >
          <SelectTrigger
            aria-label={`Successor for ${model.label}`}
            className="h-8"
          >
            <SelectValue placeholder={translate('table.chooseSuccessor')} />
          </SelectTrigger>
          <SelectContent>
            {successors.map((successor) => (
              <SelectItem key={successor.key} value={successor.key}>
                {successor.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : successorLabel ? (
        <span className="truncate text-2xs text-muted-foreground">
          {translate('table.successorWithLabel', { label: successorLabel })}
        </span>
      ) : model.succeededBy ? (
        <span className="truncate font-mono text-2xs text-muted-foreground">
          {translate('table.successorWithLabel', {
            label: model.succeededBy,
          })}
        </span>
      ) : null}
    </div>
  );
}

function formatModelCreditCost(
  model: IModel,
  translate: ModelsTableTranslate,
): string {
  if (model.isFree) {
    return 'Free';
  }

  if (model.pricingType === 'conditional' && model.hasReviewedPricing)
    return translate('table.variablePricing');

  if (!Number.isFinite(model.cost) || model.cost <= 0) return 'Unresolved';

  return model.cost.toLocaleString('en-US');
}

function formatModelQuality(qualityTier: QualityTier): string {
  return qualityTier === QualityTier.BASIC
    ? 'Basic'
    : getQualityTierLabel(qualityTier);
}

/**
 * Confidence of the typed category decision taken at discovery (#4869).
 * Seeded rows and deterministic keyword answers carry none, and show nothing.
 */
function formatCategoryConfidence(model: IModel): string | null {
  const confidence = model.categoryConfidence;

  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return null;
  }

  return `${Math.round(confidence * 100)}% confidence`;
}

export function buildModelsTableColumns({
  isAdminScope,
  isModelEnabled,
  isOnlyDefaultInCategory,
  handleAdminToggle,
  handleLifecycleChange,
  handleToggleModel,
  onOpenDetails,
  togglingModelId,
  models,
  translate,
}: BuildModelsTableColumnsParams): TableColumn<IModel>[] {
  const getRegistryStatus = (model: IModel) => {
    if (model.lifecycle === ModelLifecycle.LEGACY) {
      return {
        className: 'bg-warning/10 text-warning shadow-border',
        label: translate('table.legacyStatus'),
      };
    }

    if (model.reviewStatus === 'rejected') {
      return {
        className: 'bg-destructive/10 text-destructive shadow-border',
        label: translate('table.rejectedStatus'),
      };
    }

    if (model.isDiscovered && !model.isActive) {
      return {
        className: 'bg-info/10 text-info shadow-border',
        label: translate('table.pendingStatus'),
      };
    }

    if (model.isDiscovered) {
      return {
        className: 'bg-success/10 text-success shadow-border',
        label: translate('table.approvedStatus'),
      };
    }

    return {
      className: 'bg-secondary text-foreground/70 shadow-border',
      label: translate('table.seededStatus'),
    };
  };

  return [
    {
      header: translate('table.labelHeader'),
      key: 'label',
      sortable: true,
      render: (model: IModel) => (
        <div className="flex min-w-0 items-center gap-3">
          <ModelAvatar model={model} />
          <div className="min-w-0">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              textTransform="none"
              className="text-left font-medium text-foreground hover:underline"
              ariaLabel={`View details for ${model.label}`}
              onClick={() => onOpenDetails(model)}
            >
              {model.label}
            </Button>
            {formatCategoryConfidence(model) ? (
              <span className="block text-2xs text-muted-foreground">
                {formatCategoryConfidence(model)}
              </span>
            ) : null}
          </div>
        </div>
      ),
      subtext: (model: IModel) => model.description,
    },
    ...(isAdminScope
      ? [
          {
            className: 'max-w-[11rem]',
            header: translate('table.keyHeader'),
            key: 'key',
            sortable: true,
            render: (model: IModel) => (
              <span
                className="block max-w-[11rem] truncate whitespace-nowrap font-mono text-2xs text-muted-foreground"
                title={model.key}
              >
                {model.key}
              </span>
            ),
          },
        ]
      : []),
    ...(isAdminScope
      ? [
          {
            header: translate('table.registryHeader'),
            key: 'reviewStatus',
            sortable: true,
            render: (model: IModel) => {
              const status = getRegistryStatus(model);
              return (
                <Badge className={`text-xs uppercase ${status.className}`}>
                  {status.label}
                </Badge>
              );
            },
          },
        ]
      : []),
    {
      header: translate('table.qualityHeader'),
      key: 'qualityTier',
      sortable: true,
      render: (model: IModel) => {
        const qualityTier =
          model.qualityTier ??
          getQualityTierForModel(model.key, model.category);

        return (
          <div className="flex items-center gap-2">
            <ModelSelectorQualityBar qualityTier={qualityTier} />
            <span className="text-xs text-muted-foreground">
              {formatModelQuality(qualityTier)}
            </span>
          </div>
        );
      },
    },
    {
      header: translate('table.costHeader'),
      key: 'cost',
      sortable: true,
      render: (model: IModel) => {
        const breakdown = isAdminScope
          ? formatAdminCostTooltip(model, translate)
          : null;
        const cost = (
          <span
            className="rounded-sm text-xs tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={breakdown ? 0 : undefined}
          >
            {formatModelCreditCost(model, translate)}
          </span>
        );

        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            {!isAdminScope && model.costTier ? (
              <ModelSelectorCostBadge costTier={model.costTier} />
            ) : null}
            {breakdown ? (
              <SimpleTooltip
                contentClassName="max-w-sm whitespace-normal text-left font-normal"
                label={breakdown}
              >
                {cost}
              </SimpleTooltip>
            ) : (
              cost
            )}
          </div>
        );
      },
    },
    ...(isAdminScope
      ? [
          {
            header: translate('table.lifecycleHeader'),
            key: 'lifecycle',
            sortable: true,
            render: (model: IModel) => (
              <ModelLifecycleControl
                model={model}
                models={models}
                isDisabled={togglingModelId === model.id}
                onChange={(lifecycle, succeededBy) =>
                  handleLifecycleChange(model, lifecycle, succeededBy)
                }
                translate={translate}
              />
            ),
          },
          {
            header: translate('table.defaultHeader'),
            key: 'isDefault',
            sortable: true,
            render: (model: IModel) => (
              <Switch
                isChecked={model.isDefault}
                isDisabled={
                  !!(
                    model.lifecycle !== ModelLifecycle.RECOMMENDED ||
                    !model.isActive ||
                    isOnlyDefaultInCategory(model) ||
                    togglingModelId === model.id ||
                    isPaidModelPricingLocked(model)
                  )
                }
                onChange={() => handleAdminToggle(model, 'isDefault')}
              />
            ),
          },
        ]
      : [
          {
            header: '',
            key: 'enabled',
            render: (model: IModel) => {
              const isEnabled = isModelEnabled(model.id);
              const isToggling = togglingModelId === model.id;

              return (
                <Switch
                  isChecked={isEnabled}
                  onChange={() => handleToggleModel(model, !isEnabled)}
                  isDisabled={
                    isToggling ||
                    (model.isDefault && isEnabled) ||
                    (isPaidModelPricingLocked(model) && !isEnabled)
                  }
                />
              );
            },
          },
        ]),
  ];
}
