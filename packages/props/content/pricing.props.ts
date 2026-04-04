import type { ISubscription } from '@genfeedai/interfaces';
import type { PricingPlanProps } from '@props/content/subscription.props';

export interface PricingCardProps {
  plan: PricingPlanProps;
  buttonLabel?: string;
  className?: string;
  subscription?: ISubscription | null;
  onSubscribe?: (plan: PricingPlanProps) => void;
}

export interface PricingToggleProps {
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
}
