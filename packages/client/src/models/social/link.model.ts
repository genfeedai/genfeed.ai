import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { LinkCategory } from '@genfeedai/enums';
import type { IBrand, ILink } from '@genfeedai/interfaces';

export class Link extends BaseEntity implements ILink {
  public declare brand?: IBrand;
  public declare label: string;
  public declare category: LinkCategory;
  public declare url: string;

  constructor(data: Partial<ILink> = {}) {
    super(data);
  }
}
