import type { VideoEaseCurve } from '@genfeedai/enums';

export interface EaseCurveSelectorProps {
  value?: VideoEaseCurve;
  onChange: (value: VideoEaseCurve | undefined) => void;
  label?: string;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  dropdownDirection?: 'up' | 'down' | 'left' | 'right';
  isFullWidth?: boolean;
}
