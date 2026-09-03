import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IPostingSet,
  IPostingSetLifecycleValidation,
  IPostingSetTarget,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';

export class PostingSignature extends BaseEntity implements IPostingSignature {
  declare public body: string;
  declare public brand?: IPostingSignature['brand'];
  declare public brandId?: string | null;
  declare public isEnabled: boolean;
  declare public label: string;
  declare public organization?: IPostingSignature['organization'];
  declare public organizationId: string;
  declare public placement: IPostingSignature['placement'];
  declare public platforms: IPostingSignature['platforms'];
  declare public user?: IPostingSignature['user'];
  declare public userId: string;

  constructor(data: Partial<IPostingSignature> = {}) {
    super(data);
  }
}

export class PostingSet extends BaseEntity implements IPostingSet {
  declare public brand?: IPostingSet['brand'];
  declare public brandId?: string | null;
  declare public description?: string | null;
  declare public isEnabled: boolean;
  declare public label: string;
  declare public organization?: IPostingSet['organization'];
  declare public organizationId: string;
  declare public targets: IPostingSetTarget[];
  declare public user?: IPostingSet['user'];
  declare public userId: string;
  declare public validation: IPostingSetLifecycleValidation;

  constructor(data: Partial<IPostingSet> = {}) {
    super(data);
  }
}
