import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Link } from '@genfeedai/prisma';

export class LinkEntity extends BaseEntity implements Link {
  declare readonly brand: string;
  declare readonly brandId: string;
  declare readonly label: string;
  declare readonly category: Link['category'];
  declare readonly url: string;
}
