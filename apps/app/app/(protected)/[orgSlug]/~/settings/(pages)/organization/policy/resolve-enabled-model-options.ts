import type { IModel } from '@genfeedai/contracts/interfaces';
import type { EnabledModelOption } from '@props/settings/model-routing.props';

export type { EnabledModelOption } from '@props/settings/model-routing.props';

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
