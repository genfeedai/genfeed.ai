import type { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';

export interface ModelBrowserModalProps {
  hasError: boolean;
  isLoading: boolean;
  isOpen: boolean;
  models: readonly IModel[];
  onClose: () => void;
  onSelect: (model: IModel) => void;
  selectedKey?: string;
}

export interface WorkflowModelFieldProps {
  categories: readonly ModelCategory[];
  onChange: (modelKey: string) => void;
  value: string;
}
