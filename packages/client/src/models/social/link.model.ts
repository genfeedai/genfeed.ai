import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { LinkCategory } from '@genfeedai/contracts';
import type { IBrand, ILink } from '@genfeedai/contracts/interfaces';

export class Link extends BaseEntity implements ILink {
  declare public brandId: string;
  declare public brand?: IBrand;
  declare public label: string;
  declare public category: LinkCategory;
  declare public url: string;

  constructor(data: Partial<ILink> = {}) {
    super(data);
  }
}
