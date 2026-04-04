import type { IActivity } from '@genfeedai/interfaces';
import { Activity as BaseActivity } from '@genfeedai/client/models';
import { ActivityKey } from '@genfeedai/enums';
import { User } from '@models/auth/user.model';

export class Activity extends BaseActivity {
  constructor(partial: Partial<IActivity>) {
    super(partial);

    if (partial?.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }

  public get label() {
    switch (this.key) {
      case ActivityKey.VIDEO_PROCESSING:
        return `Video ${this.value} started to be processed`;
      case ActivityKey.VIDEO_COMPLETED:
      case ActivityKey.VIDEO_GENERATED:
        return `Video ${this.value} generated`;
      case ActivityKey.IMAGE_PROCESSING:
        return `Image ${this.value} Processing`;
      case ActivityKey.CREDITS_ADD:
        return `${Number(this.value).toLocaleString()} $GENFEED added`;
      case ActivityKey.CREDITS_REMOVE:
        return `${Number(this.value).toLocaleString()} $GENFEED removed`;
      default:
        return this.key;
    }
  }
}
