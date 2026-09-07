import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';
import type { ChangeEvent } from 'react';

export interface EditSettingModalProps {
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
}

export interface SettingInputProps {
  label: string;
  type: 'boolean' | 'number' | 'string' | 'array';
  editedValue: unknown;
  isSaving: boolean;
  onBooleanToggle: () => void;
  onScalarChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export interface SettingRowProps {
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
  onEdit: () => void;
}

export interface OrganizationSettingsTableProps {
  settings: IOrganizationSetting | null;
  isLoading: boolean;
  organizationId: string;
  onUpdate: () => void;
}

export interface SettingGroup {
  label: string;
  settings: Array<{
    key: keyof IOrganizationSetting;
    label: string;
    type: 'boolean' | 'number' | 'string' | 'array';
  }>;
}

export interface SelectedSetting {
  key: string;
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
}
