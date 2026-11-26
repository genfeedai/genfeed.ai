import type { ReactNode } from 'react';

/** An action a field declares for itself, shown next to its control: "Edit trajectory". */
export interface ControlAction {
  /** Why the action is unavailable; shown as a tooltip and read by screen readers. */
  disabledReason?: string;
  icon?: ReactNode;
  id: string;
  isPrimary?: boolean;
  label: string;
  onSelect: () => void;
}

export interface ControlOption {
  label: string;
  value: string;
}

interface ControlFieldBase {
  actions?: ControlAction[];
  /** Field-level validation message, shown under the control and tied to it with aria-describedby. */
  error?: string;
  help?: string;
  id: string;
  /** Hide the field until the other values make it relevant. */
  isVisible?: (values: Record<string, unknown>) => boolean;
  label: string;
}

export type ControlField =
  | (ControlFieldBase & { kind: 'select'; options: ControlOption[] })
  | (ControlFieldBase & {
      kind: 'slider';
      max: number;
      min: number;
      step: number;
      unit?: string;
    })
  | (ControlFieldBase & { kind: 'switch' })
  /** A value edited in a separate surface (a trajectory, annotations): a summary plus its actions. */
  | (ControlFieldBase & { kind: 'summary'; summary: string });

export interface ControlGroup {
  description?: string;
  fields: ControlField[];
  id: string;
  label: string;
}
