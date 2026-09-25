'use client';

import {
  ButtonVariant,
  ModelLifecycle,
  QualityTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import {
  getQualityTierForModel,
  getQualityTierLabel,
} from '@genfeedai/helpers/quality-routing.helper';
import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
  getModelProviderLabel,
} from '@genfeedai/helpers/ui/model-badge.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import ModelSelectorQualityBar from '@ui/dropdowns/model-selector/ModelSelectorQualityBar';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
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

  return (
    <div className="flex min-w-32 flex-col gap-1">
      <Select
        disabled={isDisabled}
        value={lifecycle}
        onValueChange={(value) => {
          const next = value as ModelLifecycle;
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
          aria-label={`Lifecycle for ${model.label}`}
          className="h-8 w-full min-w-32"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(ModelLifecycle).map((value) => (
            <SelectItem key={value} value={value}>
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

function formatModelCreditCost(model: IModel): string {
  if (model.isFree) {
    return 'Free';
  }

  return `${model.cost.toLocaleString('en-US')} ${model.cost === 1 ? 'credit' : 'credits'}`;
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
          {
            header: translate('table.providerHeader'),
            key: 'provider',
            sortable: true,
            render: (model: IModel) => (
              <Badge
                className={`border text-xs uppercase ${getModelProviderBadgeClass(model.provider)}`}
              >
                {getModelProviderLabel(model.provider)}
              </Badge>
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
      header: translate('table.categoryHeader'),
      key: 'category',
      sortable: true,
      render: (model: IModel) => (
        <Badge
          className={`border text-xs uppercase ${getModelCategoryBadgeClass(model.category)}`}
        >
          {model.category}
        </Badge>
      ),
      // #4869: discovery records how sure the typed category decision was.
      // A pending draft with a low number is the one an operator should read
      // before approving, so the confidence rides under the badge.
      subtext: (model: IModel) => formatCategoryConfidence(model),
    },
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
      render: (model: IModel) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          {model.costTier ? (
            <ModelSelectorCostBadge costTier={model.costTier} />
          ) : null}
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatModelCreditCost(model)}
          </span>
        </div>
      ),
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
                    togglingModelId === model.id
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
                  isDisabled={isToggling || (model.isDefault && isEnabled)}
                />
              );
            },
          },
        ]),
  ];
}
