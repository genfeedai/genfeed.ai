import { Link } from '@api/collections/links/schemas/link.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { LinkCategory } from '@genfeedai/enums';

export class LinkEntity extends BaseEntity implements Link {
  declare readonly brand: string;
  declare readonly label: string;
  declare readonly category: LinkCategory;
  declare readonly url: string;
}
