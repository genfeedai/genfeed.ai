import type { IAgentWizardFormData } from '@genfeedai/contracts/interfaces';
import type { Dispatch, SetStateAction } from 'react';

export type AgentTypeConfig = {
  label: string;
};

export type Props = {
  form: IAgentWizardFormData;
  setForm: Dispatch<SetStateAction<IAgentWizardFormData>>;
  selectedBrandLabel: string | undefined;
  selectedTypeConfig: AgentTypeConfig | undefined;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};
