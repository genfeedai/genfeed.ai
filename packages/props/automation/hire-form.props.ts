import type { ContentTeamRolePreset } from '@pages/agents/content-team/content-team-presets';
import type { FormEvent } from 'react';

export interface HireFormState {
  budget: string;
  label: string;
  persona: string;
  reportsToLabel: string;
  rolePresetId: string;
  sharedTopic: string;
  teamGroup: string;
}

export interface HireFormProps {
  form: HireFormState;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (field: keyof HireFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedPreset: ContentTeamRolePreset | undefined;
}
