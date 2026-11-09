import type {
  ICreatorSubscriptionPlan,
  IUpdateCreatorSubscriptionPlanRequest,
} from '@genfeedai/contracts/interfaces/billing';

export interface CreatorSubscriptionPlanRowProps {
  plan: ICreatorSubscriptionPlan;
  onSave: (
    brandId: string,
    request: IUpdateCreatorSubscriptionPlanRequest,
  ) => Promise<void>;
}
