import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { LinkCategory } from '@genfeedai/enums';
import { type Link } from '@genfeedai/prisma';

export class LinkEntity extends BaseEntity implements Link {
  declare readonly brand: string;
  declare readonly label: string;
  declare readonly category: LinkCategory;
  declare readonly url: string;
}
