import {
  PostingSet as BasePostingSet,
  PostingSignature as BasePostingSignature,
} from '@genfeedai/client/models';
import type {
  IPostingSet,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class PostingSignature extends BasePostingSignature {
  constructor(partial: Partial<IPostingSignature> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }
}

export class PostingSet extends BasePostingSet {
  constructor(partial: Partial<IPostingSet> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }
}
