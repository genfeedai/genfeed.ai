import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IPostingSet,
  IPostingSetLifecycleValidation,
  IPostingSetTarget,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';

export class PostingSignature extends BaseEntity implements IPostingSignature {
  public declare body: string;
  public declare brand?: IPostingSignature['brand'];
  public declare brandId?: string | null;
  public declare isEnabled: boolean;
  public declare label: string;
  public declare organization?: IPostingSignature['organization'];
  public declare organizationId: string;
  public declare placement: IPostingSignature['placement'];
  public declare platforms: IPostingSignature['platforms'];
  public declare user?: IPostingSignature['user'];
  public declare userId: string;

  constructor(data: Partial<IPostingSignature> = {}) {
    super(data);
  }
}

export class PostingSet extends BaseEntity implements IPostingSet {
  public declare brand?: IPostingSet['brand'];
  public declare brandId?: string | null;
  public declare description?: string | null;
  public declare isEnabled: boolean;
  public declare label: string;
  public declare organization?: IPostingSet['organization'];
  public declare organizationId: string;
  public declare targets: IPostingSetTarget[];
  public declare user?: IPostingSet['user'];
  public declare userId: string;
  public declare validation: IPostingSetLifecycleValidation;

  constructor(data: Partial<IPostingSet> = {}) {
    super(data);
  }
}
