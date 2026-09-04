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
import { getModelCategoryBadgeClass } from './models-catalog-overview.helpers';

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
};

function ModelLifecycleControl({
  model,
  models,
  isDisabled,
  onChange,
}: {
  isDisabled: boolean;
  model: IModel;
  models: IModel[];
  onChange: (lifecycle: ModelLifecycle, succeededBy?: string) => void;
}) {
  const [pendingLifecycle, setPendingLifecycle] =
    useState<ModelLifecycle | null>(null);
  const lifecycle =
    pendingLifecycle ?? model.lifecycle ?? ModelLifecycle.AVAILABLE;
  const needsSuccessor =
    lifecycle === ModelLifecycle.LEGACY || lifecycle === ModelLifecycle.RETIRED;
  const successors = models.filter(
    (candidate) =>
      candidate.id !== model.id &&
      candidate.category === model.category &&
      candidate.isActive &&
      candidate.lifecycle !== ModelLifecycle.RETIRED,
  );

  return (
    <div className="flex min-w-44 flex-col gap-1">
      <Select
        disabled={isDisabled}
        value={lifecycle}
        onValueChange={(value) => {
          const next = value as ModelLifecycle;
          if (
            next === ModelLifecycle.LEGACY ||
            next === ModelLifecycle.RETIRED
          ) {
            setPendingLifecycle(next);
            return;
          }
          setPendingLifecycle(null);
          onChange(next);
        }}
      >
        <SelectTrigger
          aria-label={`Lifecycle for ${model.label}`}
          className="h-8"
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
      {needsSuccessor ? (
        <Select
          disabled={isDisabled}
          value={pendingLifecycle ? undefined : model.succeededBy}
          onValueChange={(successorKey) => {
            onChange(lifecycle, successorKey);
            setPendingLifecycle(null);
          }}
        >
          <SelectTrigger
            aria-label={`Successor for ${model.label}`}
            className="h-8"
          >
            <SelectValue placeholder="Choose successor" />
          </SelectTrigger>
          <SelectContent>
            {successors.map((successor) => (
              <SelectItem key={successor.key} value={successor.key}>
                {successor.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function formatModelCreditCost(model: IModel): string {
  if (model.isFree) {
    return 'Free';
  }

  return `${model.cost.toLocaleString()} ${model.cost === 1 ? 'credit' : 'credits'}`;
}

function formatModelQuality(qualityTier: QualityTier): string {
  return qualityTier === QualityTier.BASIC
    ? 'Basic'
    : getQualityTierLabel(qualityTier);
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
}: BuildModelsTableColumnsParams): TableColumn<IModel>[] {
  const getRegistryStatus = (model: IModel) => {
    if (model.lifecycle === ModelLifecycle.LEGACY) {
      return {
        className: 'bg-warning/10 text-warning shadow-border',
        label: 'Legacy',
      };
    }

    if (model.reviewStatus === 'rejected') {
      return {
        className: 'bg-destructive/10 text-destructive shadow-border',
        label: 'Rejected',
      };
    }

    if (model.isDiscovered && !model.isActive) {
      return {
        className: 'bg-info/10 text-info shadow-border',
        label: 'Pending',
      };
    }

    if (model.isDiscovered) {
      return {
        className: 'bg-success/10 text-success shadow-border',
        label: 'Approved',
      };
    }

    return {
      className: 'bg-secondary text-foreground/70 shadow-border',
      label: 'Seeded',
    };
  };

  return [
    {
      header: 'Label',
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
    },
    {
      className: 'truncate max-w-40',
      header: 'Description',
      key: 'description',
      sortable: true,
      render: (model: IModel) => model.description || '-',
    },
    ...(isAdminScope
      ? [
          {
            className: 'font-mono text-sm',
            header: 'Key',
            key: 'key',
            sortable: true,
          },
          {
            header: 'Provider',
            key: 'provider',
            sortable: true,
            render: (model: IModel) => (
              <Badge
                className={`text-xs uppercase ${model.providerBadgeClass}`}
              >
                {model.provider}
              </Badge>
            ),
          },
        ]
      : []),
    ...(isAdminScope
      ? [
          {
            header: 'Registry',
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
      header: 'Category',
      key: 'category',
      sortable: true,
      render: (model: IModel) => (
        <Badge
          className={`text-xs uppercase ${getModelCategoryBadgeClass(model.category)}`}
        >
          {model.category}
        </Badge>
      ),
    },
    {
      header: 'Quality',
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
      header: 'Cost',
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
            header: 'Lifecycle',
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
              />
            ),
          },
          {
            header: 'Default',
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
