'use client';

import type { IModel } from '@genfeedai/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import { Switch } from '@ui/primitives/switch';

export type BuildModelsTableColumnsParams = {
  isAdminScope: boolean;
  isModelEnabled: (modelId: string) => boolean;
  isOnlyDefaultInCategory: (model: IModel) => boolean;
  handleAdminToggle: (model: IModel, field: 'isActive' | 'isDefault') => void;
  handleToggleModel: (model: IModel, enabled: boolean) => void;
  togglingModelId: string | null;
};

export function buildModelsTableColumns({
  isAdminScope,
  isModelEnabled,
  isOnlyDefaultInCategory,
  handleAdminToggle,
  handleToggleModel,
  togglingModelId,
}: BuildModelsTableColumnsParams): TableColumn<IModel>[] {
  const getRegistryStatus = (model: IModel) => {
    if (model.isLegacy || model.reviewStatus === 'legacy') {
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
    { header: 'Label', key: 'label' },
    {
      className: 'truncate max-w-40',
      header: 'Description',
      key: 'description',
      render: (model: IModel) => model.description || '-',
    },
    ...(isAdminScope
      ? [
          { className: 'font-mono text-sm', header: 'Key', key: 'key' },
          {
            header: 'Provider',
            key: 'provider',
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
      render: (model: IModel) => (
        <Badge className={`text-xs uppercase ${model.categoryBadgeClass}`}>
          {model.category}
        </Badge>
      ),
    },
    {
      header: 'Value',
      key: 'cost',
      render: (val: IModel) => {
        const tier = val.costTier || 'low';
        const tierLabel =
          tier === 'high' ? 'Best' : tier === 'medium' ? 'Better' : 'Good';
        const tierClass =
          tier === 'high'
            ? 'bg-foreground/15 text-foreground'
            : tier === 'medium'
              ? 'bg-muted-foreground/15 text-foreground/80'
              : 'bg-secondary text-foreground/70';
        return <Badge className={`text-xs ${tierClass}`}>{tierLabel}</Badge>;
      },
    },
    ...(isAdminScope
      ? [
          {
            header: 'Active',
            key: 'isActive',
            render: (model: IModel) => (
              <Switch
                isChecked={model.isActive}
                isDisabled={
                  model.isActive && isOnlyDefaultInCategory(model)
                    ? true
                    : togglingModelId === model.id
                }
                onChange={() => handleAdminToggle(model, 'isActive')}
              />
            ),
          },
          {
            header: 'Default',
            key: 'isDefault',
            render: (model: IModel) => (
              <Switch
                isChecked={model.isDefault}
                isDisabled={
                  !!(
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
                  isDisabled={isToggling || model.isDefault}
                />
              );
            },
          },
        ]),
  ];
}
