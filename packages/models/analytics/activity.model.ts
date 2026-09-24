import { Activity as BaseActivity } from '@genfeedai/client/models';
import {
  ActivityKey,
  formatActivityMessage,
  getActivityMessageDescriptor,
  parseCreditActivityValue,
} from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';

function formatCreditLabel(
  key: string,
  value: string | undefined,
): string | null {
  if (key !== ActivityKey.CREDITS_ADD && key !== ActivityKey.CREDITS_REMOVE) {
    return null;
  }

  const { amount, description } = parseCreditActivityValue(value);
  if (key === ActivityKey.CREDITS_REMOVE && description) {
    return description;
  }
  if (amount === null) {
    return null;
  }

  const amountLabel = amount.toLocaleString();
  const unit = amount === 1 ? 'credit' : 'credits';
  if (key === ActivityKey.CREDITS_ADD) {
    return `${amountLabel} ${unit} added`;
  }
  return `${amountLabel} ${unit} used`;
}

export class Activity extends BaseActivity {
  constructor(partial: Partial<IActivity>) {
    super(partial);

    if (partial?.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }

  /**
   * Human-readable title from the activity-key catalog.
   * Wire keys and raw payload values never surface as labels.
   */
  public get label(): string {
    const key = typeof this.key === 'string' ? this.key.trim() : '';
    if (!key) {
      return 'Activity recorded';
    }

    const creditLabel = formatCreditLabel(key, this.value);
    if (creditLabel) {
      return creditLabel;
    }

    return formatActivityMessage(getActivityMessageDescriptor(key));
  }
}
