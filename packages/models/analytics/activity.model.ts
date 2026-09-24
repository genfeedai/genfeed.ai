import { Activity as BaseActivity } from '@genfeedai/client/models';
import {
  ActivityKey,
  formatActivityMessage,
  getActivityMessageDescriptor,
  getCreditActivityMessageDescriptor,
} from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';

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

    if (
      [
        ActivityKey.CREDITS_ADD,
        ActivityKey.CREDITS_REMOVE,
        ActivityKey.CREDITS_RESET,
        ActivityKey.CREDITS_REMOVE_ALL,
      ].includes(key as ActivityKey)
    ) {
      return formatActivityMessage(
        getCreditActivityMessageDescriptor(key, this.value, this.source),
      );
    }

    return formatActivityMessage(getActivityMessageDescriptor(key));
  }
}
