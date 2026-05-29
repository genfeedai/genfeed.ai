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
            ? 'bg-emerald-500/20 text-emerald-400'
            : tier === 'medium'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-foreground/10 text-foreground/70';
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
