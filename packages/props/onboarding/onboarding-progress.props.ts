export interface OnboardingProgressProps {
  orientation?: 'horizontal' | 'vertical';
  onStepChange?: (step: number) => void;
  disabledSteps?: readonly number[];
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}
