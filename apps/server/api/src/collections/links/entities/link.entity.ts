import { BaseEntity } from '@api/entities/base.entity';
import { type Link } from '@genfeedai/prisma';

export class LinkEntity extends BaseEntity implements Link {
  declare readonly brandId: string;
  declare readonly label: string;
  declare readonly category: Link['category'];
  declare readonly url: string;
}
