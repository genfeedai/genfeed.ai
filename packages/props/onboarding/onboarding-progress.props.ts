export interface OnboardingProgressProps {
  orientation?: 'horizontal' | 'vertical';
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}
