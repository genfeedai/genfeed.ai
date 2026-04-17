import { Tag } from '@api/collections/tags/schemas/tag.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TagCategory } from '@genfeedai/enums';

export class TagEntity extends BaseEntity implements Tag {
  declare readonly user?: string;
  declare readonly organization?: string;
  declare readonly brand?: string;

  declare readonly category: TagCategory;

  declare readonly label: string;
  declare readonly description?: string;
  declare readonly key?: string;
  declare readonly backgroundColor?: string;
  declare readonly textColor?: string;
  declare readonly isActive: boolean;
}
