import { Link } from '@api/collections/links/schemas/link.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { LinkCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class LinkEntity extends BaseEntity implements Link {
  declare readonly brand: Types.ObjectId;
  declare readonly label: string;
  declare readonly category: LinkCategory;
  declare readonly url: string;
}
