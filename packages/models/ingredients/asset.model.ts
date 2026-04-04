import type { IAsset } from '@genfeedai/interfaces';
import { Asset as BaseAsset } from '@genfeedai/client/models';
import { User } from '@models/auth/user.model';

export class Asset extends BaseAsset {
  constructor(partial: Partial<IAsset>) {
    super(partial);

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user as unknown as Partial<User>);
    }
  }
}
