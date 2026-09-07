export interface TaskPillSelectProps<TValue extends string> {
  ariaLabel: string;
  isDisabled?: boolean;
  onChange: (value: TValue) => void;
  value: TValue;
}
