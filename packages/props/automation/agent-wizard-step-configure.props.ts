import type { IAgentWizardFormData } from '@genfeedai/contracts/interfaces';
import type { Dispatch, SetStateAction } from 'react';

export type Props = {
  form: IAgentWizardFormData;
  setForm: Dispatch<SetStateAction<IAgentWizardFormData>>;
  onTogglePlatform: (platform: string) => void;
  onBack: () => void;
  onNext: () => void;
};
