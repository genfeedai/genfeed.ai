import type { IModel } from '@genfeedai/contracts/interfaces';

export type EnabledModelOption = {
  label: string;
  value: string;
};

export function resolveEnabledModelOptions(
  enabledModelIds: string[],
  models: Array<Pick<IModel, 'id' | 'key' | 'label'>>,
): EnabledModelOption[] {
  return enabledModelIds.map((id) => {
    const match = models.find((model) => model.id === id || model.key === id);
    return {
      label: match?.label || match?.key || id,
      value: id,
    };
  });
}
