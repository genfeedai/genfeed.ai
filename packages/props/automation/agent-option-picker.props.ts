import type { ReactNode } from 'react';

export interface AgentOptionPickerItem<Value extends string = string> {
  description: string;
  icon?: ReactNode;
  label: string;
  meta: string;
  value: Value;
}

export interface AgentOptionPickerProps<Value extends string = string> {
  label: string;
  onValueChange: (value: Value) => void;
  options: AgentOptionPickerItem<Value>[];
  value: Value;
}
