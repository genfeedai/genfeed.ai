import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { LinkCategory } from '@genfeedai/contracts';
import type { IBrand, ILink } from '@genfeedai/contracts/interfaces';

export class Link extends BaseEntity implements ILink {
  public declare brandId: string;
  public declare brand?: IBrand;
  public declare label: string;
  public declare category: LinkCategory;
  public declare url: string;

  constructor(data: Partial<ILink> = {}) {
    super(data);
  }
}
